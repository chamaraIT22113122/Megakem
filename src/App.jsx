import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  AppBar, 
  Toolbar, 
  IconButton, 
  Card, 
  CardContent, 
  CardActionArea,
  List, 
  ListItem, 
  ListItemText, 
  ListItemButton,
  Chip,
  Container,
  CircularProgress,
  Snackbar,
  Alert,
  Grid,
  Paper,
  Fab,
  Divider,
  ThemeProvider,
  createTheme,
  CssBaseline
} from '@mui/material';

import {
  QrCodeScanner,
  CameraAlt,
  Person,
  Inventory2,
  AdminPanelSettings,
  ArrowForward,
  Delete,
  Add,
  Layers,
  CheckCircle,
  History as HistoryIcon
} from '@mui/icons-material';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, push, onValue, serverTimestamp } from 'firebase/database';
import { firebaseConfig, APP_ID } from './firebaseConfig';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- MOCK DATA ---
const MOCK_QR_CODES = [
  JSON.stringify({ name: "UltraSeal Waterproofing", batch: "BATCH-2024-001", bag: "BAG-8821", id: "PRD-99102", qty: "5KG" }),
  JSON.stringify({ name: "Premium Wall Putty", batch: "BATCH-2024-002", bag: "BAG-9943", id: "PRD-11203", qty: "20KG" }),
  JSON.stringify({ name: "Exterior Primer X", batch: "BATCH-2024-015", bag: "BAG-1102", id: "PRD-55401", qty: "10L" }),
  JSON.stringify({ name: "SuperBond Adhesive", batch: "BATCH-2024-088", bag: "BAG-3341", id: "PRD-77201", qty: "1KG" }),
];

// --- HELPER: Load External Script ---
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// --- THEME ---
const theme = createTheme({
  palette: {
    primary: {
      main: '#4338ca', // Indigo
    },
    secondary: {
      main: '#fbbf24', // Amber/Yellow
    },
    background: {
      default: '#f8fafc',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          padding: '12px 24px',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        },
      },
    },
  },
});

export default function LoyaltyAppMUI() {
  // --- STATE ---
  const [user, setUser] = useState(null);
  const [view, setView] = useState('welcome');
  const [role, setRole] = useState('applicator');
  const [memberId, setMemberId] = useState('');
  const [memberName, setMemberName] = useState('');
  const [cart, setCart] = useState([]);
  const [scanHistory, setScanHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Notification State
  const [snackbar, setSnackbar] = useState({ open: false, msg: '', type: 'success' });

  // Scanner State
  const scannerRef = useRef(null);

  // --- AUTH ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Auth error:", e);
        showNotification("Connection Error", "error");
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // --- ADMIN FETCH ---
  useEffect(() => {
    if (!user || view !== 'admin') return;
    const scansRef = ref(db, `artifacts/${APP_ID}/scans`);
    const unsubscribe = onValue(scansRef, (snapshot) => {
      const data = [];
      snapshot.forEach((childSnapshot) => {
        data.push({ id: childSnapshot.key, ...childSnapshot.val() });
      });
      data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setScanHistory(data);
    });
    return () => unsubscribe();
  }, [user, view]);

  // --- SCANNER LOGIC (Real Camera) ---
  useEffect(() => {
    let html5QrcodeScanner;

    if (view === 'scanner') {
      loadScript("https://unpkg.com/html5-qrcode")
        .then(() => {
          if (window.Html5QrcodeScanner) {
            const container = document.getElementById('reader');
            if (container) {
                container.innerHTML = ""; 
            }

            html5QrcodeScanner = new window.Html5QrcodeScanner(
              "reader",
              { 
                fps: 10, 
                qrbox: { width: 250, height: 250 },
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true,
              },
              false
            );

            html5QrcodeScanner.render(
              (decodedText) => {
                // Success callback
                handleScan(decodedText);
                html5QrcodeScanner.clear().catch(err => console.error("Failed to clear scanner", err));
              }, 
              (errorMessage) => {
                // Error callback - most are just "no QR code found" so we ignore
                if (errorMessage.includes("NotAllowedError")) {
                  showNotification("Camera permission denied", "error");
                } else if (errorMessage.includes("NotFoundError")) {
                  showNotification("No camera found", "error");
                }
              }
            );
            
            scannerRef.current = html5QrcodeScanner;
          }
        })
        .catch(err => {
          console.error("Failed to load QR library", err);
          showNotification("Failed to load camera", "error");
        });
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [view]);

  // --- HANDLERS ---
  const showNotification = (msg, type = 'success') => {
    setSnackbar({ open: true, msg, type });
  };

  const handleCloseSnackbar = () => setSnackbar({ ...snackbar, open: false });

  const handleScan = (qrString) => {
    try {
      let data;
      try {
        data = JSON.parse(qrString);
      } catch {
        data = { name: "Unknown Item", batch: "N/A", bag: "N/A", id: qrString, qty: "1" };
      }

      const newItem = { ...data, tempId: Date.now() + Math.random() };
      setCart(prev => [...prev, newItem]);
      showNotification("Item Added to Cart!");
      setView('cart');
    } catch (e) {
      showNotification("Scan Error", "error");
    }
  };

  const handleRemoveItem = (tempId) => {
    setCart(prev => prev.filter(item => item.tempId !== tempId));
  };

  const handleSubmitAll = async () => {
    if (!user) return showNotification("Waiting for connection...", "error");
    if (cart.length === 0) return showNotification("List is empty", "error");
    if (!memberId.trim() || !memberName.trim()) return showNotification("Please enter Name and ID", "error");

    setLoading(true);
    try {
      const scansRef = ref(db, `artifacts/${APP_ID}/scans`);
      const promises = cart.map(item => 
        push(scansRef, {
          memberName,
          memberId: memberId.toUpperCase(),
          role,
          productName: item.name,
          productNo: item.id,
          batchNo: item.batch,
          bagNo: item.bag,
          qty: item.qty,
          timestamp: Date.now(),
          uid: user.uid
        })
      );
      await Promise.all(promises);
      
      showNotification(`Successfully submitted ${cart.length} items!`, "success");
      setCart([]);
      setMemberId('');
      setMemberName('');
      setView('welcome');
    } catch (error) {
      console.error("Error:", error);
      showNotification("Transfer failed", "error");
    } finally {
      setLoading(false);
    }
  };

  // --- LOADING SCREEN ---
  if (!user) return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <CircularProgress />
      <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>Securely connecting...</Typography>
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
        
        {/* APP BAR */}
        <AppBar position="static" elevation={0}>
          <Toolbar>
            <QrCodeScanner sx={{ mr: 2, color: 'secondary.main' }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
              ScanTrak
            </Typography>
            <Button 
              color="inherit" 
              onClick={() => setView(view === 'admin' ? 'welcome' : 'admin')}
              sx={{ bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
            >
              {view === 'admin' ? 'App' : 'Admin'}
            </Button>
          </Toolbar>
        </AppBar>

        {/* MAIN CONTENT CONTAINER */}
        <Container maxWidth="sm" sx={{ flexGrow: 1, py: 3, display: 'flex', flexDirection: 'column' }}>
          
          {/* --- WELCOME VIEW --- */}
          {view === 'welcome' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
              <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Box sx={{ 
                  width: 80, height: 80, bgcolor: 'primary.light', borderRadius: '50%', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
                  color: 'white'
                }}>
                  <Layers fontSize="large" />
                </Box>
                <Typography variant="h4" fontWeight="bold" gutterBottom>New Session</Typography>
                <Typography variant="body1" color="text.secondary">Select your role to begin scanning.</Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Card 
                    sx={{ 
                      bgcolor: role === 'applicator' ? 'primary.50' : 'white',
                      border: role === 'applicator' ? '2px solid' : '1px solid',
                      borderColor: role === 'applicator' ? 'primary.main' : 'grey.200'
                    }}
                  >
                    <CardActionArea onClick={() => { setRole('applicator'); setView('scanner'); setCart([]); }} sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'white', mr: 2 }}>
                           <Inventory2 color="primary" />
                        </Box>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="h6" fontWeight="bold">Applicator</Typography>
                          <Typography variant="body2" color="text.secondary">Contractor / Worker</Typography>
                        </Box>
                        <ArrowForward color="action" />
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>

                <Grid item xs={12}>
                  <Card
                    sx={{ 
                      bgcolor: role === 'customer' ? 'primary.50' : 'white',
                      border: role === 'customer' ? '2px solid' : '1px solid',
                      borderColor: role === 'customer' ? 'primary.main' : 'grey.200'
                    }}
                  >
                    <CardActionArea onClick={() => { setRole('customer'); setView('scanner'); setCart([]); }} sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                         <Box sx={{ p: 1, borderRadius: '50%', bgcolor: 'white', mr: 2 }}>
                           <Person color="primary" />
                        </Box>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="h6" fontWeight="bold">Customer</Typography>
                          <Typography variant="body2" color="text.secondary">End User / Buyer</Typography>
                        </Box>
                        <ArrowForward color="action" />
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* --- SCANNER VIEW (Real Camera) --- */}
          {view === 'scanner' && (
            <Paper sx={{ flexGrow: 1, bgcolor: '#000', color: 'white', overflow: 'hidden', position: 'relative', borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
              
              {/* Camera Viewport */}
              <Box sx={{ flexGrow: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#000' }}>
                
                {/* This DIV is where the Camera Stream loads */}
                <div id="reader" style={{ width: '100%', height: '100%' }}></div>

                {/* Fallback Visual */}
                <Box sx={{ position: 'absolute', zIndex: 0, opacity: 0.3, textAlign: 'center' }}>
                   <Typography variant="caption">Loading Camera...</Typography>
                </Box>

                {/* Cart Overlay */}
                {cart.length > 0 && (
                  <Fab variant="extended" size="small" color="default" onClick={() => setView('cart')} sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
                    View Cart ({cart.length})
                  </Fab>
                )}

                {/* Cancel Button */}
                <Button 
                  variant="contained"
                  onClick={() => cart.length > 0 ? setView('cart') : setView('welcome')} 
                  sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
                >
                  {cart.length > 0 ? 'View Cart' : 'Cancel'}
                </Button>
              </Box>
            </Paper>
          )}

          {/* --- CART VIEW --- */}
          {view === 'cart' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ mb: 3 }}>
                <Typography variant="h5" fontWeight="bold">Scanned Items</Typography>
                <Typography variant="body2" color="text.secondary">
                  {cart.length} items ready for submission
                </Typography>
              </Box>

              <Box sx={{ flexGrow: 1, overflowY: 'auto', mb: 3 }}>
                {cart.map((item) => (
                  <Card key={item.tempId} sx={{ mb: 2, position: 'relative' }}>
                    <CardContent>
                      <IconButton 
                        size="small" 
                        onClick={() => handleRemoveItem(item.tempId)}
                        sx={{ position: 'absolute', top: 8, right: 8, color: 'text.disabled' }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                      
                      <Typography variant="subtitle1" fontWeight="bold" sx={{ pr: 4 }}>{item.name}</Typography>
                      
                      <Box sx={{ display: 'flex', gap: 1, my: 1 }}>
                        <Chip label={item.qty} size="small" color="primary" sx={{ bgcolor: 'primary.50', color: 'primary.main', fontWeight: 'bold' }} />
                        <Chip label={item.id} size="small" variant="outlined" />
                      </Box>
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, pt: 1, borderTop: '1px solid #f0f0f0' }}>
                        <Typography variant="caption" color="text.secondary">Batch: {item.batch}</Typography>
                        <Typography variant="caption" color="text.secondary">Bag: {item.bag}</Typography>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
                
                <Button 
                  variant="outlined" 
                  fullWidth 
                  startIcon={<Add />} 
                  onClick={() => setView('scanner')}
                  sx={{ borderStyle: 'dashed', borderWidth: 2, py: 2 }}
                >
                  Scan Another Item
                </Button>
              </Box>

              <Paper elevation={3} sx={{ p: 3, borderRadius: 3 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField 
                      fullWidth 
                      label={`${role === 'applicator' ? 'Applicator' : 'Customer'} Name`}
                      variant="outlined"
                      value={memberName}
                      onChange={(e) => setMemberName(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField 
                      fullWidth 
                      label="Member ID"
                      placeholder="e.g. APP-001"
                      variant="outlined"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button 
                      fullWidth 
                      variant="contained" 
                      size="large" 
                      disabled={loading || cart.length === 0}
                      onClick={handleSubmitAll}
                      startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <CheckCircle />}
                    >
                      {loading ? 'Submitting...' : `Submit ${cart.length} Items`}
                    </Button>
                  </Grid>
                </Grid>
              </Paper>
            </Box>
          )}

          {/* --- ADMIN VIEW --- */}
          {view === 'admin' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ mb: 2, p: 2, bgcolor: 'white', borderRadius: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AdminPanelSettings color="primary" /> Live Data Feed
                </Typography>
              </Box>

              <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {scanHistory.length === 0 ? (
                  <Box sx={{ textAlign: 'center', mt: 8, opacity: 0.5 }}>
                    <HistoryIcon sx={{ fontSize: 60, mb: 2 }} />
                    <Typography>No data recorded yet.</Typography>
                  </Box>
                ) : (
                  scanHistory.map((item, i) => (
                    <Card key={i} sx={{ mb: 2, borderLeft: '4px solid', borderLeftColor: 'primary.main' }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Box>
                            <Typography variant="subtitle1" fontWeight="bold">{item.memberName || 'Unknown'}</Typography>
                            <Chip label={item.memberId} size="small" sx={{ borderRadius: 1, height: 20, fontSize: '0.7rem' }} />
                          </Box>
                          <Chip 
                            label={item.role} 
                            size="small" 
                            color={item.role === 'applicator' ? 'warning' : 'info'} 
                            sx={{ textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 'bold' }}
                          />
                        </Box>
                        
                        <Divider sx={{ my: 1 }} />
                        
                        <Typography variant="body2" color="text.secondary">Product: <Box component="span" color="text.primary">{item.productName}</Box></Typography>
                        <Typography variant="body2" color="text.secondary">ID: {item.productNo}</Typography>
                        
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                          <Chip label={`Batch: ${item.batchNo}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                          <Chip label={`Bag: ${item.bagNo}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                        </Box>

                        <Typography variant="caption" sx={{ display: 'block', textAlign: 'right', mt: 1, color: 'text.disabled' }}>
                          {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : 'Pending'}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))
                )}
              </Box>
            </Box>
          )}

        </Container>

        {/* NOTIFICATIONS */}
        <Snackbar 
          open={snackbar.open} 
          autoHideDuration={4000} 
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert onClose={handleCloseSnackbar} severity={snackbar.type} variant="filled" sx={{ width: '100%' }}>
            {snackbar.msg}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
