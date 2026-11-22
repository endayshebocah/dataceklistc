import React, { useState, useMemo, useRef, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = typeof __firebase_config !== 'undefined'
  ? JSON.parse(__firebase_config)
  : {
      apiKey: "AIzaSyD3G1HWzxoyBJhR-zWxGENNwR8w43kX0N8",
      authDomain: "tckokuo-2d6d3.firebaseapp.com",
      projectId: "tckokuo-2d6d3",
      storageBucket: "tckokuo-2d6d3.firebasestorage.app",
      messagingSenderId: "468659295902",
      appId: "1:468659295902:web:2a63ebaa7ab56f8a3c8d8f",
      measurementId: "G-SQ06S21MK6"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'catering-app-v2-exclusive';

export default function SpreadsheetApp() {
  const [authUser, setAuthUser] = useState(null);

  // Pre-filled data for the first 14 rows (Names in UPPERCASE)
  const initialData = [
    { nama: 'NADILAH' },
    { nama: 'DEA' },
    { nama: 'ALIN' },
    { nama: 'NAYLA' },
    { nama: 'DITA' },
    { nama: 'RIZAL' },
    { nama: 'TATANG' },
    { nama: 'ARGA' },
    { nama: 'NASA' },
    { nama: 'MADSOLEH' },
    { nama: 'SAMANI' },
    { nama: 'DANI' },
    { nama: 'RINO' },
    { nama: 'ALAM JAGAT' },
  ];

  // Helper to generate default dates for the week starting from Monday 9/11/2026 or current week
  const defaultDaysMeta = [
    { day: 'SENIN', date: '9/11/2026' },
    { day: 'SELASA', date: '10/11/2026' },
    { day: 'RABU', date: '11/11/2026' },
    { day: 'KAMIS', date: '12/11/2026' },
    { day: 'JUMAT', date: '13/11/2026' },
    { day: 'SABTU', date: '14/11/2026' },
    { day: 'MINGGU', date: '15/11/2026' },
  ];

  // Initialize state with 30 rows
  const [rows, setRows] = useState(() => {
    const savedData = localStorage.getItem('trainingData');
    if (savedData) {
      try {
        return JSON.parse(savedData);
      } catch (e) {
        console.error("Failed to parse local storage data", e);
      }
    }
    return Array.from({ length: 30 }, (_, i) => {
      const prefill = initialData[i];
      return {
        id: i + 1,
        nama: prefill ? prefill.nama : '',
        periode: '',
        keterangan: '',
        dailyData: {
          SENIN: { pagi: false, sore: false },
          SELASA: { pagi: false, sore: false },
          RABU: { pagi: false, sore: false },
          KAMIS: { pagi: false, sore: false },
          JUMAT: { pagi: false, sore: false },
          SABTU: { pagi: false, sore: false },
          MINGGU: { pagi: false, sore: false },
        },
        hasSignature: false,
      };
    });
  });

  const [activeSignatureRow, setActiveSignatureRow] = useState(null);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [activeSaveInfo, setActiveSaveInfo] = useState('');
  
  // Saved Files & Preview Rekapan Modal States
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [savedFiles, setSavedFiles] = useState([]);
  const [editingFileId, setEditingFileId] = useState(null);

  // Global Periode State
  const [periode, setPeriode] = useState(() => {
    return localStorage.getItem('trainingPeriode') || 'Nov 2026';
  });

  // Search filter state
  const [searchQuery, setSearchQuery] = useState('');

  // First-time Open Name Popup Restored
  const [showInitialNameModal, setShowInitialNameModal] = useState(true);
  const [inputtedName, setInputtedName] = useState('');
  const [matchedRowIndex, setMatchedRowIndex] = useState(null);
  const [isModalAdminMode, setIsModalAdminMode] = useState(false);
  const [modalPinInput, setModalPinInput] = useState('');

  // Role Management State
  const [userRole, setUserRole] = useState(null); // 'admin' or null
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');

  // Auto-save draft ke localStorage
  useEffect(() => {
    localStorage.setItem('trainingData', JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    localStorage.setItem('trainingPeriode', periode);
  }, [periode]);

  // Firebase Auth & Data Sync Setup
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          const cred = await signInWithCustomToken(auth, __initial_auth_token);
          setAuthUser(cred.user);
        } else {
          const cred = await signInAnonymously(auth);
          setAuthUser(cred.user);
        }
      } catch (error) {
        console.error("Auth error", error);
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    
    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'trainingFiles');
    const unsubscribe = onSnapshot(collRef, (snapshot) => {
       const files = snapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
       files.sort((a, b) => b.id - a.id);
       setSavedFiles(files);
    }, (error) => {
       console.warn("Snapshot notice (offline/permissions):", error.message);
    });
    
    return () => unsubscribe();
  }, [authUser]);

  // Real-time Collaboration (Live Sync)
  const activeDocRef = useMemo(() => {
    if (!authUser) return null;
    if (editingFileId) {
      return doc(db, 'artifacts', appId, 'public', 'data', 'trainingFiles', editingFileId);
    } else {
      return doc(db, 'artifacts', appId, 'public', 'data', 'active_session', 'LIVE_SESSION');
    }
  }, [authUser, editingFileId]);

  useEffect(() => {
    if (!activeDocRef) return;
    
    const unsubscribe = onSnapshot(activeDocRef, (docSnap) => {
      if (docSnap.exists()) {
        if (!docSnap.metadata.hasPendingWrites) {
          const data = docSnap.data();
          if (data.data) {
            setRows(data.data);
            localStorage.setItem('trainingData', JSON.stringify(data.data));
          }
          if (data.periode !== undefined) {
            setPeriode(data.periode);
            localStorage.setItem('trainingPeriode', data.periode);
          }
        }
      } else if (!editingFileId) {
        setDoc(activeDocRef, { data: rows, periode: periode, timestamp: Date.now() }).catch(err => {
          console.warn("Doc creation notice:", err.message);
        });
      }
    }, (error) => {
      console.warn("Active session snapshot notice:", error.message);
    });

    return () => unsubscribe();
  }, [activeDocRef, editingFileId]);

  const syncToCloud = async (newRows, newPeriode) => {
    if (!activeDocRef) return;
    try {
      if (editingFileId) {
        await updateDoc(activeDocRef, { data: newRows, periode: newPeriode, date: new Date().toLocaleString('id-ID') });
      } else {
        await setDoc(activeDocRef, { data: newRows, periode: newPeriode, timestamp: Date.now() });
      }
    } catch (error) {
      console.warn("Sync to cloud notice:", error.message);
    }
  };

  const handleNameChange = (index, value) => {
    if (userRole !== 'admin') return;
    const newRows = [...rows];
    newRows[index].nama = value.toUpperCase();
    setRows(newRows);
    syncToCloud(newRows, periode);
  };

  const handleKeteranganChange = (index, value) => {
    if (userRole !== 'admin') return;
    const newRows = [...rows];
    newRows[index].keterangan = value;
    setRows(newRows);
    syncToCloud(newRows, periode);
  };

  const handleDailyMealChange = (index, dayKey, mealType, checked) => {
    if (userRole !== 'admin') return;
    const newRows = [...rows];
    if (!newRows[index].dailyData) {
      newRows[index].dailyData = {
        SENIN: { pagi: false, sore: false },
        SELASA: { pagi: false, sore: false },
        RABU: { pagi: false, sore: false },
        KAMIS: { pagi: false, sore: false },
        JUMAT: { pagi: false, sore: false },
        SABTU: { pagi: false, sore: false },
        MINGGU: { pagi: false, sore: false },
      };
    }
    newRows[index].dailyData[dayKey][mealType] = checked;
    setRows(newRows);
    syncToCloud(newRows, periode);
  };

  const handlePeriodeChange = (e) => {
    if (userRole !== 'admin') return;
    const value = e.target.value;
    setPeriode(value);
    syncToCloud(rows, value);
  };

  const daysList = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];

  // Calculate totals automatically using useMemo
  const { totalJmlh, totalUangMakan, dayTotals } = useMemo(() => {
    let totalAllMeals = 0;
    const dTotals = { 
      SENIN: { pagi: 0, sore: 0 }, 
      SELASA: { pagi: 0, sore: 0 }, 
      RABU: { pagi: 0, sore: 0 }, 
      KAMIS: { pagi: 0, sore: 0 }, 
      JUMAT: { pagi: 0, sore: 0 }, 
      SABTU: { pagi: 0, sore: 0 }, 
      MINGGU: { pagi: 0, sore: 0 } 
    };
    
    rows.forEach(row => {
      const daily = row.dailyData || {};
      daysList.forEach(day => {
        const dObj = daily[day] || { pagi: false, sore: false };
        if (dObj.pagi) dTotals[day].pagi += 1;
        if (dObj.sore) dTotals[day].sore += 1;

        const count = (dObj.pagi ? 1 : 0) + (dObj.sore ? 1 : 0);
        totalAllMeals += count;
      });
    });

    const allowance = totalAllMeals * 13000;

    return { totalJmlh: totalAllMeals, totalUangMakan: allowance, dayTotals: dTotals };
  }, [rows]);

  // Canvas Drawing Logic
  useEffect(() => {
    if (activeSignatureRow !== null && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const currentRow = rows[activeSignatureRow];
      if (currentRow && currentRow.signatureData) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        };
        img.src = currentRow.signatureData;
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [activeSignatureRow, rows]);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.nativeEvent.offsetX,
      y: e.nativeEvent.offsetY,
    };
  };

  const startDrawing = (e) => {
    if(e.cancelable && e.type.includes('touch')) e.preventDefault();
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if(e.cancelable && e.type.includes('touch')) e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClearSignature = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSaveSignature = () => {
    if (activeSignatureRow !== null && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      const pixelBuffer = new Uint32Array(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer
      );
      const hasPixels = pixelBuffer.some(color => color !== 0);

      const newRows = [...rows];
      if (hasPixels) {
        const dataUrl = canvas.toDataURL('image/png');
        newRows[activeSignatureRow].hasSignature = true;
        newRows[activeSignatureRow].signatureData = dataUrl;
      } else {
        newRows[activeSignatureRow].hasSignature = false;
        newRows[activeSignatureRow].signatureData = null;
      }
      
      setRows(newRows);
      setActiveSignatureRow(null);
      syncToCloud(newRows, periode);
    }
  };

  const handleSaveData = async () => {
    if (!authUser) {
      setToastMessage('❌ Gagal: Belum terhubung ke server');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    try {
      if (editingFileId) {
        setEditingFileId(null);
        setActiveSaveInfo('');
        setToastMessage('✔ Selesai! Kembali ke Sesi Draft Utama.');
        setTimeout(() => setToastMessage(''), 3000);
      } else {
        const newFile = {
          id: Date.now(),
          date: new Date().toLocaleString('id-ID'),
          data: rows,
          periode: periode
        };
        const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'trainingFiles');
        await addDoc(collRef, newFile);
        
        const emptyRows = Array.from({ length: 30 }, (_, i) => ({
          id: i + 1,
          nama: '',
          periode: '',
          keterangan: '',
          dailyData: {
            SENIN: { pagi: false, sore: false },
            SELASA: { pagi: false, sore: false },
            RABU: { pagi: false, sore: false },
            KAMIS: { pagi: false, sore: false },
            JUMAT: { pagi: false, sore: false },
            SABTU: { pagi: false, sore: false },
            MINGGU: { pagi: false, sore: false },
          },
          hasSignature: false,
        }));
        setRows(emptyRows);
        setPeriode('');
        syncToCloud(emptyRows, '');
        
        setToastMessage('✔ Data berhasil diarsipkan ke Cloud!');
        setTimeout(() => setToastMessage(''), 3000);
      }
    } catch (error) {
      console.error("Save error", error);
      setToastMessage('❌ Gagal menyimpan data');
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  const handleOpenFilesModal = () => {
    setIsFilesModalOpen(true);
  };

  const handleOpenFile = (file) => {
    setRows(file.data);
    setPeriode(file.periode || '');
    setEditingFileId(file.firebaseId);
    localStorage.setItem('trainingData', JSON.stringify(file.data));
    localStorage.setItem('trainingPeriode', file.periode || '');
    setActiveSaveInfo(`Membuka Arsip: ${file.periode ? file.periode : file.date} (Tersimpan otomatis)`);
    setIsFilesModalOpen(false);
    setToastMessage('✔ Arsip dibuka. Perubahan langsung tersimpan real-time!');
    setTimeout(() => setToastMessage(''), 4000);
  };

  const handleDeleteFile = async (file) => {
    if (!authUser) return;
    
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'trainingFiles', file.firebaseId);
      await deleteDoc(docRef);
      setToastMessage('✔ Data berhasil dihapus dari Cloud!');
      setTimeout(() => setToastMessage(''), 3000);
    } catch (error) {
      console.error("Delete error", error);
      setToastMessage('❌ Gagal menghapus data');
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  const handleExportExcel = () => {
    let csvContent = "REKAPAN PEMBAYARAN CATRING,,,,,,,,,,,,,,,\n";
    const safePeriode = (periode || '').replace(/,/g, ' ');
    if (safePeriode) {
      csvContent += `Periode: ${safePeriode},,,,,,,,,,,,,,,\n`;
    }
    csvContent += "\n";
    csvContent += "NO,NAMA,SENIN (P/S),SELASA (P/S),RABU (P/S),KAMIS (P/S),JUMAT (P/S),SABTU (P/S),MINGGU (P/S),JMLH,Rp 13000,TOTAL,TTD,KET\n";

    rows.forEach((row, index) => {
      const daily = row.dailyData || {};
      let rowTotalMeals = 0;
      daysList.forEach(d => {
        const obj = daily[d] || { pagi: false, sore: false };
        if (obj.pagi) rowTotalMeals += 1;
        if (obj.sore) rowTotalMeals += 1;
      });

      const uangMakan = rowTotalMeals > 0 ? rowTotalMeals * 13000 : '';
      const safeNama = (row.nama || '').replace(/,/g, ' '); 
      const rp13000 = index === 0 ? '13000' : '';
      const ttd = row.hasSignature ? 'Sudah TTD' : '';
      const safeKet = (row.keterangan || '').replace(/,/g, ' ');
      
      const formatDayStr = (dKey) => {
        const obj = daily[dKey] || { pagi: false, sore: false };
        let s = [];
        if (obj.pagi) s.push('Pagi');
        if (obj.sore) s.push('Sore');
        return s.join('/') || '-';
      };

      csvContent += `${row.id},${safeNama},${formatDayStr('SENIN')},${formatDayStr('SELASA')},${formatDayStr('RABU')},${formatDayStr('KAMIS')},${formatDayStr('JUMAT')},${formatDayStr('SABTU')},${formatDayStr('MINGGU')},${rowTotalMeals > 0 ? rowTotalMeals : ''},${rp13000},${uangMakan},${ttd},${safeKet}\n`;
    });

    csvContent += `Total,,,,,,,,,${totalJmlh || 0},,${totalUangMakan || ''},\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "Rekapan_Pembayaran_Catring.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleLoginAdmin = () => {
    if (pinInput === '112233' || modalPinInput === '112233') {
      setUserRole('admin');
      setShowInitialNameModal(false);
      setIsLoginModalOpen(false);
      setIsModalAdminMode(false);
      setPinInput('');
      setModalPinInput('');
      setToastMessage('✔ Berhasil masuk sebagai Admin');
      setTimeout(() => setToastMessage(''), 3000);
    } else {
      setToastMessage('❌ PIN Salah!');
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  const handleCheckInitialName = (e) => {
    e.preventDefault();
    const cleanName = inputtedName.trim().toUpperCase();
    if (!cleanName) return;

    const foundIndex = rows.findIndex(r => r.nama && r.nama.toUpperCase() === cleanName);
    if (foundIndex !== -1) {
      setMatchedRowIndex(foundIndex);
    } else {
      setToastMessage('❌ Nama tidak ditemukan dalam daftar.');
      setTimeout(() => setToastMessage(''), 3000);
      setMatchedRowIndex(null);
    }
  };

  const handleInitialDailyMealChange = (dayKey, mealType, checked) => {
    if (matchedRowIndex !== null) {
      const newRows = [...rows];
      if (!newRows[matchedRowIndex].dailyData) {
        newRows[matchedRowIndex].dailyData = {
          SENIN: { pagi: false, sore: false },
          SELASA: { pagi: false, sore: false },
          RABU: { pagi: false, sore: false },
          KAMIS: { pagi: false, sore: false },
          JUMAT: { pagi: false, sore: false },
          SABTU: { pagi: false, sore: false },
          MINGGU: { pagi: false, sore: false },
        };
      }
      newRows[matchedRowIndex].dailyData[dayKey][mealType] = checked;
      setRows(newRows);
      syncToCloud(newRows, periode);
    }
  };

  // When clicking Selesai in initial modal, save and reset back to initial search state without opening the full app
  const handleCloseInitialModal = () => {
    setInputtedName('');
    setMatchedRowIndex(null);
    setToastMessage('✔ Absensi berhasil disimpan!');
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleCancelInitialModal = () => {
    setInputtedName('');
    setMatchedRowIndex(null);
    setIsModalAdminMode(false);
    setModalPinInput('');
    setShowInitialNameModal(false);
  };

  const handleLogout = () => {
    setUserRole(null);
    setToastMessage('Anda telah keluar');
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleAddRow = () => {
    setRows(prevRows => {
      const newRows = [
        ...prevRows,
        {
          id: prevRows.length + 1,
          nama: '',
          periode: '',
          keterangan: '',
          dailyData: {
            SENIN: { pagi: false, sore: false },
            SELASA: { pagi: false, sore: false },
            RABU: { pagi: false, sore: false },
            KAMIS: { pagi: false, sore: false },
            JUMAT: { pagi: false, sore: false },
            SABTU: { pagi: false, sore: false },
            MINGGU: { pagi: false, sore: false },
          },
          hasSignature: false,
        }
      ];
      syncToCloud(newRows, periode);
      return newRows;
    });
  };

  const handleDeleteLastRow = () => {
    if (userRole !== 'admin') return;
    setRows(prevRows => {
      if (prevRows.length <= 1) {
        setToastMessage('❌ Minimal harus ada 1 baris.');
        setTimeout(() => setToastMessage(''), 3000);
        return prevRows;
      }
      const newRows = prevRows.slice(0, -1);
      syncToCloud(newRows, periode);
      setToastMessage('✔ Baris terakhir berhasil dihapus.');
      setTimeout(() => setToastMessage(''), 3000);
      return newRows;
    });
  };

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const query = searchQuery.toLowerCase();
    return rows.filter(row => 
      (row.nama && row.nama.toLowerCase().includes(query)) ||
      String(row.id).includes(query)
    );
  }, [rows, searchQuery]);

  return (
    <div className="min-h-screen bg-gray-100 p-1 sm:p-4 md:p-6 font-sans flex justify-center print:bg-white print:p-0">
      <div className="bg-white shadow-lg rounded-lg p-3 sm:p-5 w-full max-w-7xl overflow-x-auto border border-gray-300 print:shadow-none print:border-none print:p-0 print:overflow-visible relative">
        
        {/* Role Banner */}
        <div className="absolute top-0 right-0 bg-gray-800 text-white text-[9px] sm:text-xs px-2 py-1 rounded-bl-lg rounded-tr-lg font-medium print:hidden flex items-center gap-2 shadow-sm">
          <span>Mode: {userRole === 'admin' ? '👑 Admin' : '🔒 Belum Login'}</span>
          {userRole ? (
            <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded text-[8px] sm:text-[10px] transition">Keluar</button>
          ) : (
            <button onClick={() => setIsLoginModalOpen(true)} className="bg-blue-500 hover:bg-blue-600 px-2 py-0.5 rounded text-[8px] sm:text-[10px] transition">Login</button>
          )}
        </div>

        {/* Action Buttons Section - Aligned with table width */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center w-full mb-3 print:hidden gap-2 pb-2 mt-6 sm:mt-4 border-b border-gray-200">
          <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center">
            <button 
              onClick={handleSaveData}
              disabled={userRole !== 'admin'}
              className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-[10px] sm:text-sm text-white font-semibold rounded shadow-sm transition whitespace-nowrap ${userRole !== 'admin' ? 'bg-gray-400 cursor-not-allowed' : editingFileId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {editingFileId ? 'Selesai Edit & Tutup' : 'Simpan (Arsipkan)'}
            </button>
            <button 
              onClick={handleOpenFilesModal}
              disabled={userRole !== 'admin'}
              className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-[10px] sm:text-sm text-white font-semibold rounded shadow-sm transition whitespace-nowrap ${userRole !== 'admin' ? 'bg-gray-400 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-600'}`}
            >
              Data Tersimpan
            </button>

            {userRole === 'admin' && (
               <span className="flex items-center gap-1 text-[9px] sm:text-xs text-green-600 font-medium bg-green-50 px-2.5 py-1.5 rounded-md border border-green-200 shadow-sm">
                 <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                 </span>
                 Live Sync
               </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 sm:gap-2 items-center justify-end">
            {toastMessage && (
              <span className="text-green-700 bg-green-100 px-2 py-1 rounded text-[9px] sm:text-xs font-medium animate-pulse whitespace-nowrap shadow-sm">
                {toastMessage}
              </span>
            )}
            <button 
              onClick={handleExportExcel}
              disabled={userRole !== 'admin'}
              className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-[10px] sm:text-sm text-white font-semibold rounded shadow-sm transition whitespace-nowrap ${userRole !== 'admin' ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              Export Excel
            </button>
            <button 
              onClick={handlePrint}
              disabled={userRole !== 'admin'}
              className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-[10px] sm:text-sm text-white font-semibold rounded shadow-sm transition whitespace-nowrap ${userRole !== 'admin' ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-600 hover:bg-gray-700'}`}
            >
              Cetak
            </button>
          </div>
        </div>

        {activeSaveInfo && (
          <div className="mb-3 p-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-md font-medium text-center text-xs print:hidden">
            ℹ️ {activeSaveInfo}
          </div>
        )}

        {/* Periode Input Form & Search Bar - Perfectly aligned with table bounds */}
        <div className="mb-3 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 print:hidden bg-gray-50 p-2.5 rounded-lg border border-gray-200">
          <div className="flex flex-row items-center gap-2 w-full sm:w-auto">
            <label className="font-bold text-gray-700 uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap">Periode:</label>
            <input
              type="text"
              value={periode}
              onChange={handlePeriodeChange}
              disabled={userRole !== 'admin'}
              className={`border border-gray-300 rounded bg-white py-1 px-2.5 w-full sm:w-64 outline-none text-xs sm:text-sm shadow-sm ${userRole !== 'admin' ? 'text-gray-800 cursor-not-allowed bg-gray-100' : 'focus:border-blue-600'}`}
              placeholder="Misal: Nov 2026"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs font-bold text-gray-600 whitespace-nowrap">🔍 Cari:</span>
            <div className="relative flex items-center w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama peserta..."
                className="border border-gray-300 rounded bg-white px-2.5 py-1 text-xs sm:text-sm w-full outline-none focus:border-blue-500 shadow-sm"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 text-xs bg-gray-200 hover:bg-gray-300 px-1.5 py-0.5 rounded text-gray-700 transition">✕</button>
              )}
            </div>
          </div>
        </div>

        {/* Periode view for Print */}
        <div className="mb-3 hidden print:flex flex-row items-end gap-2">
          <label className="font-bold text-gray-700 uppercase tracking-wide text-base">Periode:</label>
          <span className="border-b-2 border-gray-400 py-1 px-2 text-base">{periode}</span>
        </div>

        {/* Spreadsheet Table */}
        <table className="w-full border-collapse border border-black table-auto text-[8px] sm:text-xs md:text-sm">
          <thead>
            <tr>
              <th colSpan="12" className="border border-black py-1 sm:py-2 text-center font-bold text-[11px] sm:text-lg md:text-xl uppercase tracking-wide bg-white">
                REKAPAN PEMBAYARAN CATRING
              </th>
            </tr>
            <tr className="bg-gray-50 text-center">
              <th className="border border-black py-1 px-1 whitespace-nowrap">NO</th>
              <th className="border border-black py-1 px-2 text-left whitespace-nowrap">NAMA</th>
              
              {/* Day Headers with Date & Pagi/Sore indicator */}
              {defaultDaysMeta.map((meta, idx) => (
                <th key={idx} className="border border-black py-1 px-1 leading-tight">
                  <div className="font-bold text-[8px] sm:text-xs uppercase text-blue-900">{meta.day}</div>
                  <div className="text-[7px] sm:text-[10px] font-normal text-gray-600">{meta.date}</div>
                  <div className="text-[6px] sm:text-[9px] font-semibold text-gray-500 mt-0.5 border-t border-gray-300 pt-0.5">Pagi | Sore</div>
                </th>
              ))}

              <th className="border border-black py-1 px-1 whitespace-nowrap">Jmlh</th>
              {userRole === 'admin' && (
                <th className="border border-black py-1 px-1 whitespace-nowrap">Rp 13000</th>
              )}
              {userRole === 'admin' && (
                <th className="border border-black py-1 px-1 whitespace-nowrap">TOTAL</th>
              )}
              <th className="border border-black py-1 px-1 whitespace-nowrap">TTD</th>
              <th className="border border-black py-1 px-1 whitespace-nowrap">KET</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan="12" className="border border-black py-4 text-center text-gray-500 text-xs italic">
                  Tidak ada data yang cocok dengan pencarian "{searchQuery}"
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const originalIndex = rows.findIndex(r => r.id === row.id);
                const daily = row.dailyData || {};
                
                let rowTotalMeals = 0;
                daysList.forEach(d => {
                  const obj = daily[d] || { pagi: false, sore: false };
                  if (obj.pagi) rowTotalMeals += 1;
                  if (obj.sore) rowTotalMeals += 1;
                });

                const uangMakan = rowTotalMeals > 0 ? rowTotalMeals * 13000 : '';

                const ketUpper = (row.keterangan || '').trim().toUpperCase();
                let rowBgClass = 'hover:bg-gray-50 transition-colors';
                if (ketUpper === 'RESIGN' || ketUpper === 'RISGN') {
                  rowBgClass = 'bg-red-100 hover:bg-red-200 transition-colors';
                } else if (ketUpper === 'LULUS') {
                  rowBgClass = 'bg-blue-100 hover:bg-blue-200 transition-colors';
                }

                return (
                  <tr key={row.id} className={rowBgClass}>
                    <td className="border border-black py-1 px-1 text-center font-medium">
                      {row.id}
                    </td>
                    <td className="border border-black p-0">
                      <input
                        type="text"
                        value={row.nama}
                        onChange={(e) => handleNameChange(originalIndex, e.target.value)}
                        disabled={userRole !== 'admin'}
                        className={`w-full min-w-[80px] sm:min-w-[140px] h-full py-1 px-1 outline-none text-[8px] sm:text-xs uppercase bg-transparent ${userRole !== 'admin' ? 'text-gray-800 cursor-not-allowed' : 'focus:bg-white/60'}`}
                        placeholder={originalIndex >= 14 && userRole === 'admin' ? "..." : ""}
                      />
                    </td>

                    {/* Daily Checkboxes for Pagi & Sore with individual day status/note check */}
                    {daysList.map((dayKey) => {
                      const dayObj = daily[dayKey] || { pagi: false, sore: false };
                      const dayNoteUpper = (dayObj.note || '').trim().toUpperCase();
                      
                      let dayCellBg = '';
                      if (dayNoteUpper === 'IZIN' || ketUpper === 'IZIN') {
                        dayCellBg = 'bg-yellow-300';
                      } else if (dayNoteUpper === 'SAKIT' || ketUpper === 'SAKIT') {
                        dayCellBg = 'bg-purple-300';
                      } else if (dayNoteUpper === 'ALPA' || ketUpper === 'ALPA') {
                        dayCellBg = 'bg-red-500 text-white';
                      }

                      return (
                        <td key={dayKey} className={`border border-black py-1 px-0.5 text-center align-middle ${dayCellBg}`}>
                          <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                            <label className="flex items-center gap-0.5 cursor-pointer" title={`${dayKey} Pagi`}>
                              <input
                                type="checkbox"
                                checked={dayObj.pagi || false}
                                onChange={(e) => handleDailyMealChange(originalIndex, dayKey, 'pagi', e.target.checked)}
                                disabled={userRole !== 'admin'}
                                className="w-3 h-3 sm:w-3.5 sm:h-3.5 cursor-pointer accent-blue-600"
                              />
                              <span className="text-[7px] sm:text-[9px] opacity-75">P</span>
                            </label>
                            <label className="flex items-center gap-0.5 cursor-pointer" title={`${dayKey} Sore`}>
                              <input
                                type="checkbox"
                                checked={dayObj.sore || false}
                                onChange={(e) => handleDailyMealChange(originalIndex, dayKey, 'sore', e.target.checked)}
                                disabled={userRole !== 'admin'}
                                className="w-3 h-3 sm:w-3.5 sm:h-3.5 cursor-pointer accent-orange-600"
                              />
                              <span className="text-[7px] sm:text-[9px] opacity-75">S</span>
                            </label>
                          </div>
                        </td>
                      );
                    })}

                    <td className="border border-black py-1 px-1 text-center font-bold">
                      {rowTotalMeals > 0 ? rowTotalMeals : ''}
                    </td>
                    {userRole === 'admin' && (
                      <td className="border border-black py-1 px-1 text-center text-gray-500">
                        {originalIndex === 0 && <span className="text-[8px]">13000</span>}
                      </td>
                    )}
                    {userRole === 'admin' && (
                      <td className="border border-black py-1 px-1 text-right pr-2 font-bold">
                        {uangMakan ? uangMakan.toLocaleString('id-ID') : ''}
                      </td>
                    )}
                    <td 
                      className={`border border-black py-0 px-1 text-center ${userRole ? 'cursor-pointer hover:bg-black/5' : 'cursor-not-allowed'} transition-colors select-none min-w-[35px] sm:min-w-[50px] relative`}
                      onClick={() => {
                        if (userRole) setActiveSignatureRow(originalIndex);
                      }}
                      title={!userRole ? 'Silakan login untuk mengisi TTD' : row.hasSignature ? `Edit TTD ${row.nama || `Peserta ${row.id}`}` : `Tanda tangani untuk ${row.nama || `Peserta ${row.id}`}`}
                    >
                      {row.signatureData ? (
                        <div className="flex items-center justify-center w-full h-full py-0.5">
                          <img src={row.signatureData} alt="TTD" className="h-4 sm:h-6 mx-auto object-contain mix-blend-multiply" />
                        </div>
                      ) : row.hasSignature ? (
                        <span className="text-green-600 font-bold text-xs sm:text-base">✔</span>
                      ) : (
                        userRole ? <span className="text-gray-400 text-[8px] sm:text-[10px] italic block py-0.5">TTD</span> : null
                      )}
                    </td>
                    <td className="border border-black p-0">
                      <input
                        type="text"
                        value={row.keterangan || ''}
                        onChange={(e) => handleKeteranganChange(originalIndex, e.target.value.toUpperCase())}
                        disabled={userRole !== 'admin'}
                        placeholder="Ket"
                        className={`w-full min-w-[50px] sm:min-w-[70px] h-full py-1 px-1 outline-none text-[8px] sm:text-xs uppercase text-center bg-transparent font-medium ${userRole !== 'admin' ? 'text-gray-800 cursor-not-allowed' : 'focus:bg-white/60'}`}
                      />
                    </td>
                  </tr>
                );
              })
            )}
            
            {/* Auto-sum Footer Row */}
            <tr className="font-bold bg-gray-100 text-center">
              <td colSpan="2" className="border border-black py-1 px-2 text-right pr-2">
                Total
              </td>
              {daysList.map(dKey => {
                const dayTotal = dayTotals[dKey] || { pagi: 0, sore: 0 };
                const displayTotal = (dayTotal.pagi > 0 || dayTotal.sore > 0) ? `${dayTotal.pagi}/${dayTotal.sore}` : '';
                return (
                  <td key={dKey} className="border border-black py-1 px-0.5 text-blue-700 text-[9px] sm:text-xs">
                    {displayTotal}
                  </td>
                );
              })}
              <td className="border border-black py-1 px-1 text-blue-700">
                {totalJmlh || ''}
              </td>
              {userRole === 'admin' && (
                <td className="border border-black py-1 px-1"></td>
              )}
              {userRole === 'admin' && (
                <td className="border border-black py-1 px-2 text-right pr-2 text-blue-700">
                  {totalUangMakan ? totalUangMakan.toLocaleString('id-ID') : ''}
                </td>
              )}
              <td className="border border-black py-1 px-1"></td>
              <td className="border border-black py-1 px-1"></td>
            </tr>
          </tbody>
        </table>

        {/* Tambah & Hapus Kolom Baris Buttons */}
        {userRole === 'admin' && (
          <div className="mt-3 flex gap-2 print:hidden">
            <button
              onClick={handleAddRow}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded shadow transition flex items-center justify-center gap-1"
            >
              <span>➕</span> Tambah Kolom Baris
            </button>
            <button
              onClick={handleDeleteLastRow}
              className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs sm:text-sm rounded shadow transition flex items-center justify-center gap-1"
            >
              <span>🗑️</span> Hapus Baris Terakhir
            </button>
          </div>
        )}
      </div>

      {/* Admin Login Modal */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 text-center text-gray-800">Masuk Mode Admin</h2>
            <p className="text-xs text-center text-gray-500 mb-4">Masukkan PIN untuk mengakses Mode Admin.</p>
            <form onSubmit={(e) => { e.preventDefault(); handleLoginAdmin(); }}>
              <input 
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Masukkan PIN Anda"
                className="w-full border border-gray-300 rounded px-3 py-2 text-center text-lg tracking-widest focus:outline-none focus:border-blue-500 mb-4"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button 
                  type="button"
                  onClick={() => {setIsLoginModalOpen(false); setPinInput('');}} 
                  className="px-3 py-2 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300 transition"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition"
                >
                  Masuk Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Initial Name Popup Modal Restored */}
      {showInitialNameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="text-center mb-4 relative">
              <button 
                type="button"
                onClick={() => {
                  setIsModalAdminMode(!isModalAdminMode);
                  setModalPinInput('');
                  setMatchedRowIndex(null);
                }}
                className="absolute top-0 right-0 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-semibold px-2.5 py-1 rounded shadow transition"
              >
                {isModalAdminMode ? 'Kembali' : 'Login Admin'}
              </button>
              <span className="text-3xl mb-1 block">👋</span>
              <h2 className="text-xl font-bold text-gray-800">
                {isModalAdminMode ? 'Masuk Mode Admin' : 'Masukkan Nama Peserta'}
              </h2>
            </div>

            {isModalAdminMode ? (
              <form onSubmit={(e) => { e.preventDefault(); handleLoginAdmin(); }} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">PIN Admin:</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={modalPinInput}
                    onChange={(e) => setModalPinInput(e.target.value)}
                    placeholder="Masukkan PIN 112233"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center text-lg tracking-widest focus:outline-none focus:border-blue-500 font-medium bg-gray-50"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalAdminMode(false);
                      setModalPinInput('');
                    }}
                    className="w-1/2 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-sm rounded-lg transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow transition"
                  >
                    Masuk Admin
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCheckInitialName} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nama Lengkap:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputtedName}
                      onChange={(e) => {
                        setInputtedName(e.target.value.toUpperCase());
                        setMatchedRowIndex(null);
                      }}
                      placeholder="CONTOH: NADILAH"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:border-blue-500 font-medium bg-gray-50"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow transition"
                    >
                      Cari
                    </button>
                  </div>
                </div>
              </form>
            )}

            {matchedRowIndex !== null && !isModalAdminMode && (
              <div className="mt-5 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900">NAMA DITEMUKAN:</span>
                  <span className="text-xs font-extrabold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">{rows[matchedRowIndex].nama}</span>
                </div>

                <p className="text-[11px] text-gray-600 text-center">Centang Pagi / Sore untuk hari Senin (9/11/2026):</p>

                <div className="flex items-center justify-around bg-white p-3 rounded-md border border-blue-100 shadow-sm">
                  {(!rows[matchedRowIndex].dailyData || !rows[matchedRowIndex].dailyData.SENIN || !rows[matchedRowIndex].dailyData.SENIN.pagi) && (
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={rows[matchedRowIndex].dailyData?.SENIN?.pagi || false}
                        onChange={(e) => handleInitialDailyMealChange('SENIN', 'pagi', e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded cursor-pointer"
                      />
                      PAGI
                    </label>
                  )}

                  {(!rows[matchedRowIndex].dailyData || !rows[matchedRowIndex].dailyData.SENIN || !rows[matchedRowIndex].dailyData.SENIN.sore) && (
                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={rows[matchedRowIndex].dailyData?.SENIN?.sore || false}
                        onChange={(e) => handleInitialDailyMealChange('SENIN', 'sore', e.target.checked)}
                        className="w-5 h-5 text-orange-600 rounded cursor-pointer"
                      />
                      SORE
                    </label>
                  )}

                  {rows[matchedRowIndex].dailyData?.SENIN?.pagi && rows[matchedRowIndex].dailyData?.SENIN?.sore && (
                    <span className="text-xs font-semibold text-green-600">Semua pilihan sudah terisi untuk hari ini.</span>
                  )}
                </div>

                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      setInputtedName('');
                      setMatchedRowIndex(null);
                    }}
                    className="w-1/2 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition text-sm"
                  >
                    Cari Nama Lain
                  </button>
                  <button
                    onClick={handleCloseInitialModal}
                    className="w-1/2 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition text-sm"
                  >
                    Selesai
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {activeSignatureRow !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4 text-center">
              Tanda Tangan: <span className="text-blue-600">{rows[activeSignatureRow].nama || `Peserta ${activeSignatureRow + 1}`}</span>
            </h2>
            
            <div className="border-2 border-dashed border-gray-400 bg-gray-50 rounded-lg mb-4 flex justify-center overflow-hidden touch-none">
              <canvas
                ref={canvasRef}
                width={300}
                height={150}
                className="bg-transparent cursor-crosshair w-full"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            
            <div className="flex justify-between mt-4">
               <button
                onClick={handleClearSignature}
                className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded shadow-sm hover:bg-gray-300 transition"
              >
                Hapus
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveSignatureRow(null)}
                  className="px-4 py-2 bg-red-50 text-red-600 font-medium rounded shadow-sm hover:bg-red-100 transition"
                >
                  Batal
                </button>
                <button
                  onClick={handleSaveSignature}
                  className="px-4 py-2 bg-blue-600 text-white font-medium rounded shadow-sm hover:bg-blue-700 transition"
                >
                  {rows[activeSignatureRow].hasSignature ? 'Perbarui' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saved Files Modal */}
      {isFilesModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm print:hidden">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
            <h2 className="text-xl font-bold mb-4 text-center border-b pb-2">Riwayat Data Tersimpan</h2>
            
            <div className="overflow-y-auto flex-1 mb-4 min-h-[200px]">
              {savedFiles.length === 0 ? (
                <div className="text-center text-gray-500 py-8 flex flex-col items-center">
                  <span className="text-3xl mb-2">📭</span>
                  Belum ada file yang disimpan.
                </div>
              ) : (
                <ul className="space-y-3">
                  {savedFiles.map((file, index) => {
                    const displayTitle = file.periode 
                      ? (file.periode.toLowerCase().startsWith('periode') ? file.periode : `Periode ${file.periode}`)
                      : `Periode Belum Diisi (Simpanan ${savedFiles.length - index})`;

                    return (
                      <li key={file.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 p-3 rounded-md border border-gray-200 hover:bg-gray-100 transition">
                        <div className="mb-2 sm:mb-0">
                          <span className="font-semibold text-sm block text-gray-800">{displayTitle} & Tanggal: {file.date}</span>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                          <button 
                            onClick={() => {
                              setRows(file.data);
                              setPeriode(file.periode || '');
                              setIsFilesModalOpen(false);
                              setToastMessage('✔ Rekapan ditampilkan di tabel.');
                              setTimeout(() => setToastMessage(''), 3000);
                            }} 
                            className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition shadow-sm"
                          >
                            Lihat Rekapan
                          </button>
                          <button 
                            onClick={() => handleOpenFile(file)} 
                            className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded hover:bg-blue-600 transition shadow-sm"
                          >
                            Buka / Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteFile(file)} 
                            className="px-2.5 py-1.5 bg-red-100 text-red-600 text-xs font-medium rounded hover:bg-red-200 transition"
                          >
                            Hapus
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            
            <button 
              onClick={() => setIsFilesModalOpen(false)} 
              className="w-full py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-md shadow-sm hover:bg-gray-300 transition"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

    </div>
  );
}