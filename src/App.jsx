import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  writeBatch
} from 'firebase/firestore';
import {
  Menu,
  UserPlus,
  Search,
  X,
  Users,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD3G1HWzxoyBJhR-zWxGENNwR8w43kX0N8',
  authDomain: 'tckokuo-2d6d3.firebaseapp.com',
  projectId: 'tckokuo-2d6d3',
  storageBucket: 'tckokuo-2d6d3.firebasestorage.app',
  messagingSenderId: '468659295902',
  appId: '1:468659295902:web:2a63ebaa7ab56f8a3c8d8f',
  measurementId: 'G-SQ06S21MK6'
};

const appId = 'tckokuo-2d6d3';
const app = initializeApp(DEFAULT_FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const UNIT_RATE = 15000;
const DEFAULT_FALLBACK_PIN = '11111';

const DAY_COLUMNS = [
  { key: 'd1', slot1: 'd1_1', slot2: 'd1_2', short: 'SEN', full: 'SENIN' },
  { key: 'd2', slot1: 'd2_1', slot2: 'd2_2', short: 'SEL', full: 'SELASA' },
  { key: 'd3', slot1: 'd3_1', slot2: 'd3_2', short: 'RAB', full: 'RABU' },
  { key: 'd4', slot1: 'd4_1', slot2: 'd4_2', short: 'KAM', full: 'KAMIS' },
  { key: 'd5', slot1: 'd5_1', slot2: 'd5_2', short: 'JUM', full: 'JUMAT' },
  { key: 'd6', slot1: 'd6_1', slot2: 'd6_2', short: 'SAB', full: 'SABTU' },
  { key: 'd7', slot1: 'd7_1', slot2: 'd7_2', short: 'MIN', full: 'MINGGU' }
];

const ALL_SLOT_KEYS = DAY_COLUMNS.flatMap((d) => [d.slot1, d.slot2]);

const STATUS_STYLES = {
  IZIN: { btn: 'bg-teal-600 hover:bg-teal-700 text-white', cellClass: 'status-marked-izin' },
  SAKIT: { btn: 'bg-amber-500 hover:bg-amber-600 text-white', cellClass: 'status-marked-sakit' },
  ALFA: { btn: 'bg-rose-600 hover:bg-rose-700 text-white', cellClass: 'status-marked-alfa' },
  CUTI: { btn: 'bg-indigo-600 hover:bg-indigo-700 text-white', cellClass: 'status-marked-cuti' },
  RESIGN: { btn: 'bg-purple-600 hover:bg-purple-700 text-white', cellClass: 'status-marked-resign' },
  LULUS: { btn: 'bg-emerald-600 hover:bg-emerald-700 text-white', cellClass: 'status-marked-lulus' }
};

function getEmptyChecksObject() {
  const obj = {};
  ALL_SLOT_KEYS.forEach((k) => {
    obj[k] = false;
  });
  return obj;
}

function getParticipantAllowanceDayCount(checksObj) {
  if (!checksObj || typeof checksObj !== 'object') return 0;
  return DAY_COLUMNS.reduce((acc, col) => {
    return acc + (checksObj[col.slot1] || checksObj[col.slot2] ? 1 : 0);
  }, 0);
}

function getCurrentWeekDates() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  const fullDays = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = months[d.getMonth()];
    const yyyy = d.getFullYear();
    dates.push({
      dateLabel: `${dd} ${mm}`,
      fullDateLabel: `${dd} ${mm} ${yyyy}`,
      slashDateLabel: `${dd}/${String(d.getMonth() + 1).padStart(2, '0')}/${yyyy}`,
      dayName: fullDays[d.getDay()],
      isToday: d.toDateString() === now.toDateString()
    });
  }
  return dates;
}

function formatRupiah(amount) {
  return 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
}

function parseOrderCellValue(rawVal) {
  if (!rawVal) return 0;
  const matches = String(rawVal).trim().match(/\d+/g);
  if (!matches) return 0;
  return matches.reduce((sum, n) => sum + (parseInt(n, 10) || 0), 0);
}

export default function App() {
  const weekDates = useMemo(() => getCurrentWeekDates(), []);
  const todayInfo = useMemo(() => {
    const now = new Date();
    const idx = now.getDay() === 0 ? 6 : now.getDay() - 1;
    return { col: DAY_COLUMNS[idx], dateInfo: weekDates[idx] };
  }, [weekDates]);

  const [currentUser, setCurrentUser] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('SYNCING');
  const [participants, setParticipants] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [archives, setArchives] = useState([]);
  const [dailyOrders, setDailyOrders] = useState({});
  const [statusMarks, setStatusMarks] = useState({});
  const [periodRange, setPeriodRange] = useState({ start: '', end: '' });
  const [onlineCount, setOnlineCount] = useState(1);

  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [loggedInAdminName, setLoggedInAdminName] = useState('ADMIN');
  const [isPortalLocked, setIsPortalLocked] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('CEKLIS');

  // Portal states
  const [portalQuery, setPortalQuery] = useState('');
  const [selectedParticipantId, setSelectedParticipantId] = useState(null);
  const [portalSlot1Draft, setPortalSlot1Draft] = useState(false);
  const [portalSlot2Draft, setPortalSlot2Draft] = useState(false);
  const [showAllowanceBox, setShowAllowanceBox] = useState(false);

  // Admin workspace states
  const [newParticipantName, setNewParticipantName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Modals
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  const [showTtdModal, setShowTtdModal] = useState(false);
  const ttdCanvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  const [previewTtd, setPreviewTtd] = useState(null);
  const [showQuickActionModal, setShowQuickActionModal] = useState(false);
  const [statusModalCategory, setStatusModalCategory] = useState(null);
  const [statusNoUrut, setStatusNoUrut] = useState('');
  const [statusSelectedDays, setStatusSelectedDays] = useState([]);

  const [showQuickCheckModal, setShowQuickCheckModal] = useState(false);
  const [quickCheckNoUrut, setQuickCheckNoUrut] = useState('');
  const [quickCheckPagi, setQuickCheckPagi] = useState(true);
  const [quickCheckSore, setQuickCheckSore] = useState(true);
  const [quickCheckDays, setQuickCheckDays] = useState([todayInfo.col.key]);

  const [showManageAdminModal, setShowManageAdminModal] = useState(false);
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPin, setNewAdminPin] = useState('');

  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const [toast, setToast] = useState(null);
  const notify = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 2600);
  };

  const getParticipantsColRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'checklist_participants');
  const getParticipantDocRef = (id) => doc(db, 'artifacts', appId, 'public', 'data', 'checklist_participants', id);
  const getMetaDocRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'checklist_meta', 'config');
  const getPresenceColRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'checklist_presence');
  const getPresenceDocRef = (uid) => doc(db, 'artifacts', appId, 'public', 'data', 'checklist_presence', uid);
  const getAdminsColRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'checklist_admins');
  const getAdminDocRef = (id) => doc(db, 'artifacts', appId, 'public', 'data', 'checklist_admins', id);
  const getArchivesColRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'checklist_archives');
  const getArchiveDocRef = (id) => doc(db, 'artifacts', appId, 'public', 'data', 'checklist_archives', id);

  useEffect(() => {
    signInAnonymously(auth).catch(() => setConnectionStatus('OFFLINE'));
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setConnectionStatus('ONLINE');
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const ping = () => {
      setDoc(getPresenceDocRef(currentUser.uid), {
        uid: currentUser.uid,
        lastSeen: Date.now()
      }, { merge: true }).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, 25000);

    const unsubPresence = onSnapshot(getPresenceColRef(), (snap) => {
      const now = Date.now();
      let count = 0;
      snap.forEach((d) => {
        if (d.data()?.lastSeen && now - d.data().lastSeen < 65000) count++;
      });
      setOnlineCount(Math.max(1, count));
    });

    const unsubMeta = onSnapshot(getMetaDocRef(), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (typeof data.portalNameInputLocked === 'boolean') setIsPortalLocked(data.portalNameInputLocked);
      if (data.dailyOrders) setDailyOrders(data.dailyOrders);
      if (data.statusMarks) setStatusMarks(data.statusMarks);
      if (data.periodRange) setPeriodRange({ start: data.periodRange.start || '', end: data.periodRange.end || '' });
    });

    const unsubParticipants = onSnapshot(getParticipantsColRef(), (snap) => {
      const list = [];
      snap.forEach((d) => {
        const val = d.data();
        list.push({
          id: d.id,
          name: (val.name || '').toUpperCase(),
          checks: val.checks || {},
          ket: val.ket || '',
          ttdDataUrl: val.ttdDataUrl || '',
          createdAt: val.createdAt || 0
        });
      });
      list.sort((a, b) => (a.createdAt !== b.createdAt ? a.createdAt - b.createdAt : a.name.localeCompare(b.name)));
      setParticipants(list);
      setConnectionStatus('ONLINE');
    });

    const unsubAdmins = onSnapshot(getAdminsColRef(), (snap) => {
      const list = [];
      snap.forEach((d) => {
        list.push({ id: d.id, name: (d.data().name || '').toUpperCase(), pin: String(d.data().pin || '') });
      });
      setAdmins(list);
    });

    const unsubArchives = onSnapshot(getArchivesColRef(), (snap) => {
      const list = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      setArchives(list);
    });

    return () => {
      clearInterval(interval);
      unsubPresence();
      unsubMeta();
      unsubParticipants();
      unsubAdmins();
      unsubArchives();
    };
  }, [currentUser]);

  const selectedParticipant = useMemo(
    () => participants.find((p) => p.id === selectedParticipantId) || null,
    [participants, selectedParticipantId]
  );

  useEffect(() => {
    if (!selectedParticipant) return;
    setPortalSlot1Draft(!!selectedParticipant.checks?.[todayInfo.col.slot1]);
    setPortalSlot2Draft(!!selectedParticipant.checks?.[todayInfo.col.slot2]);
  }, [selectedParticipant, todayInfo]);

  const handlePortalSearch = (e) => {
    e.preventDefault();
    if (isPortalLocked) return notify('Kolom nama sedang dikunci Admin', true);
    const q = portalQuery.trim().toUpperCase();
    if (!q) return notify('Ketik nama lengkap terlebih dahulu', true);
    const match = participants.find((p) => p.name === q) || participants.find((p) => p.name.includes(q));
    if (!match) return notify(`Nama "${q}" belum terdaftar`, true);
    setSelectedParticipantId(match.id);
    setShowAllowanceBox(false);
  };

  const handlePortalSaveChecks = async () => {
    if (!selectedParticipant) return;
    const saved1 = !!selectedParticipant.checks?.[todayInfo.col.slot1];
    const saved2 = !!selectedParticipant.checks?.[todayInfo.col.slot2];
    const updates = { updatedAt: Date.now() };
    if (!saved1 && portalSlot1Draft) updates[`checks.${todayInfo.col.slot1}`] = true;
    if (!saved2 && portalSlot2Draft) updates[`checks.${todayInfo.col.slot2}`] = true;
    await updateDoc(getParticipantDocRef(selectedParticipant.id), updates);
    notify('Ceklis berhasil disimpan');
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    const name = loginName.trim().toUpperCase();
    const pin = loginPin.trim();
    const found = admins.find((a) => a.name === name && a.pin === pin);
    const fallbackOk = admins.length === 0 && pin === DEFAULT_FALLBACK_PIN && name.length > 0;
    if (found || fallbackOk) {
      setIsAdminLoggedIn(true);
      setLoggedInAdminName(found ? found.name : name);
      setShowAdminLoginModal(false);
      setLoginError('');
      notify(`Masuk sebagai ${found ? found.name : name}`);
    } else {
      setLoginError('Nama Admin atau kode PIN tidak sesuai.');
    }
  };

  const handleAddParticipant = async (e) => {
    e.preventDefault();
    const name = newParticipantName.trim().toUpperCase();
    if (!name || !currentUser) return;
    if (participants.some((p) => p.name === name)) return notify(`Nama "${name}" sudah terdaftar`, true);
    setNewParticipantName('');
    await addDoc(getParticipantsColRef(), {
      name,
      checks: getEmptyChecksObject(),
      ket: '',
      ttdDataUrl: '',
      createdAt: Date.now(),
      createdBy: currentUser.uid
    });
    notify(`Peserta "${name}" ditambahkan`);
  };

  const handleToggleCheckbox = async (participant, slotKey, checked) => {
    await updateDoc(getParticipantDocRef(participant.id), {
      [`checks.${slotKey}`]: checked,
      updatedAt: Date.now()
    });
  };

  const handleSaveArchive = async () => {
    if (!currentUser || participants.length === 0) return notify('Tidak ada data untuk disimpan', true);
    let totalChecks = 0;
    const rows = participants.map((p, idx) => {
      const count = ALL_SLOT_KEYS.reduce((acc, k) => acc + (p.checks?.[k] ? 1 : 0), 0);
      totalChecks += count;
      return {
        no: idx + 1,
        name: p.name,
        count,
        rate: UNIT_RATE,
        total: count * UNIT_RATE,
        ket: p.ket || '',
        ttdDataUrl: p.ttdDataUrl || ''
      };
    });

    const periodLabel =
      periodRange.start && periodRange.end
        ? `${periodRange.start} s/d ${periodRange.end}`
        : `${weekDates[0].fullDateLabel} - ${weekDates[6].fullDateLabel}`;

    await addDoc(getArchivesColRef(), {
      periodLabel,
      startDate: periodRange.start || '',
      endDate: periodRange.end || '',
      savedAt: Date.now(),
      savedBy: loggedInAdminName,
      totalParticipants: participants.length,
      totalChecks,
      totalAmount: totalChecks * UNIT_RATE,
      rows
    });

    const batch = writeBatch(db);
    participants.forEach((p) => batch.delete(getParticipantDocRef(p.id)));
    await batch.commit();

    await setDoc(getMetaDocRef(), { statusMarks: {}, dailyOrders: {}, periodRange: { start: '', end: '' } }, { merge: true });
    notify('Data berhasil diarsipkan & tabel dikosongkan');
  };

  const handleSaveStatusInput = async (e) => {
    e.preventDefault();
    const idx = parseInt(statusNoUrut, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= participants.length) return notify('No urut tidak valid', true);
    if (statusSelectedDays.length === 0) return notify('Pilih minimal 1 hari', true);

    const target = participants[idx];
    const orderedCols = DAY_COLUMNS.filter((c) => statusSelectedDays.includes(c.key));
    const dayNames = orderedCols.map((c) => c.full).join(', ');
    const nextMarks = { ...(statusMarks[target.id] || {}) };
    orderedCols.forEach((c) => {
      nextMarks[c.key] = statusModalCategory;
    });

    const updatedMarksMap = { ...statusMarks, [target.id]: nextMarks };
    const ketText = `${statusModalCategory}: ${dayNames}`;

    await Promise.all([
      updateDoc(getParticipantDocRef(target.id), { ket: ketText, updatedAt: Date.now() }),
      setDoc(getMetaDocRef(), { statusMarks: updatedMarksMap }, { merge: true })
    ]);

    setStatusModalCategory(null);
    notify(`Status ${statusModalCategory} disimpan untuk ${target.name}`);
  };

  const handleApplyQuickCheck = async (e) => {
    e.preventDefault();
    if (!quickCheckPagi && !quickCheckSore) return notify('Pilih minimal Pagi atau Sore', true);
    if (quickCheckDays.length === 0) return notify('Pilih minimal 1 hari', true);

    let targets = participants;
    if (quickCheckNoUrut.trim()) {
      const idx = parseInt(quickCheckNoUrut, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= participants.length) return notify('No urut tidak valid', true);
      targets = [participants[idx]];
    }

    const batch = writeBatch(db);
    targets.forEach((p) => {
      const checks = { ...(p.checks || getEmptyChecksObject()) };
      quickCheckDays.forEach((dKey) => {
        const col = DAY_COLUMNS.find((c) => c.key === dKey);
        if (col) {
          if (quickCheckPagi) checks[col.slot1] = true;
          if (quickCheckSore) checks[col.slot2] = true;
        }
      });
      batch.update(getParticipantDocRef(p.id), { checks, updatedAt: Date.now() });
    });
    await batch.commit();
    setShowQuickCheckModal(false);
    notify('Ceklis cepat berhasil diterapkan');
  };

  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return participants;
    const q = searchQuery.trim().toUpperCase();
    return participants.filter((p) => p.name.includes(q));
  }, [participants, searchQuery]);

  const isAllowanceTab = activeSubTab === 'UANG_JAJAN';

  return (
    <div className="min-h-screen flex flex-col">
      {!isAdminLoggedIn ? (
        <div className="min-h-screen w-full bg-black text-white flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#161e2e] border border-slate-800/90 rounded-xl p-4 sm:p-5 shadow-2xl">
            <form onSubmit={handlePortalSearch}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                  NAMA LENGKAP:
                </label>
                {isPortalLocked && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-amber-950/90 text-amber-300 border border-amber-600/70">
                    🔒 Dikunci Admin
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mb-2.5">
                <input
                  type="text"
                  value={portalQuery}
                  disabled={isPortalLocked}
                  onChange={(e) => setPortalQuery(e.target.value.replace(/[0-9]/g, '').toUpperCase())}
                  placeholder={isPortalLocked ? 'KOLOM NAMA DIKUNCI ADMIN' : 'CONTOH: BUDI'}
                  className="flex-1 bg-[#1e2736] border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold uppercase text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  className="bg-[#17a2b8] hover:bg-[#138496] text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer shrink-0"
                >
                  Cari
                </button>
              </div>
            </form>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setLoginName('');
                  setLoginPin('');
                  setLoginError('');
                  setShowAdminLoginModal(true);
                }}
                className="bg-[#343f52] hover:bg-[#3f4c63] text-slate-200 font-semibold text-[11px] px-3 py-1.5 rounded-md cursor-pointer"
              >
                Login Akses
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedParticipant) return notify('Cari nama peserta terlebih dahulu', true);
                  setShowAllowanceBox(true);
                }}
                className="bg-[#15803d] hover:bg-[#166534] text-white font-semibold text-[11px] px-3 py-1.5 rounded-md cursor-pointer"
              >
                Cek Uang Jajan
              </button>
            </div>

            {selectedParticipant && (
              <div className="mt-4 pt-4 border-t border-slate-700/80 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-700/70">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    PERIODE AKTIF
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${
                      selectedParticipant.ttdDataUrl
                        ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700/70'
                        : 'bg-amber-950/90 text-amber-300 border-amber-700/70'
                    }`}
                  >
                    {selectedParticipant.ttdDataUrl ? '✓ Sudah TTD' : '⚠ Belum TTD'}
                  </span>
                </div>

                <div className="bg-[#111827] border border-slate-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">NAMA:</span>
                  <span className="text-xs font-extrabold text-white uppercase truncate">
                    {selectedParticipant.name}
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 font-medium">
                  Centang Pagi / Sore untuk hari {todayInfo.dateInfo.dayName} ({todayInfo.dateInfo.slashDateLabel}):
                </p>

                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex items-center gap-2.5 bg-[#111827] border border-slate-700 rounded-lg px-3 py-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="portal-checkbox"
                      checked={portalSlot1Draft}
                      disabled={!!selectedParticipant.checks?.[todayInfo.col.slot1]}
                      onChange={(e) => setPortalSlot1Draft(e.target.checked)}
                    />
                    <span className="text-xs font-bold text-white uppercase">PAGI</span>
                  </label>
                  <label className="flex items-center gap-2.5 bg-[#111827] border border-slate-700 rounded-lg px-3 py-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="portal-checkbox"
                      checked={portalSlot2Draft}
                      disabled={!!selectedParticipant.checks?.[todayInfo.col.slot2]}
                      onChange={(e) => setPortalSlot2Draft(e.target.checked)}
                    />
                    <span className="text-xs font-bold text-white uppercase">SORE</span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handlePortalSaveChecks}
                  disabled={
                    !(
                      (!selectedParticipant.checks?.[todayInfo.col.slot1] && portalSlot1Draft) ||
                      (!selectedParticipant.checks?.[todayInfo.col.slot2] && portalSlot2Draft)
                    )
                  }
                  className="w-full bg-[#15803d] disabled:bg-slate-700 disabled:text-slate-400 text-white font-bold text-xs py-2.5 rounded-lg cursor-pointer"
                >
                  Simpan Ceklis
                </button>

                {!selectedParticipant.ttdDataUrl && (
                  <button
                    type="button"
                    onClick={() => setShowTtdModal(true)}
                    className="w-full bg-[#d97706] hover:bg-[#b45309] text-white font-bold text-xs py-2.5 rounded-lg cursor-pointer"
                  >
                    ✍️ Klik Disini Untuk Isi TTD (Periode Aktif)
                  </button>
                )}
              </div>
            )}

            {showAllowanceBox && selectedParticipant && (
              <div className="mt-3 bg-[#111827] border border-emerald-800/70 rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-extrabold text-emerald-300 uppercase">{selectedParticipant.name}</span>
                  <button
                    type="button"
                    onClick={() => setShowAllowanceBox(false)}
                    className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
                <p className="text-slate-300 text-[11px]">
                  Total Hari: {getParticipantAllowanceDayCount(selectedParticipant.checks)} ×{' '}
                  {formatRupiah(UNIT_RATE)} ={' '}
                  {formatRupiah(getParticipantAllowanceDayCount(selectedParticipant.checks) * UNIT_RATE)}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="min-h-screen flex flex-col">
          <section className="bg-white border-b border-slate-300 no-print">
            <div className="max-w-7xl mx-auto px-2 py-2 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-1 w-full sm:max-w-xl">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(true)}
                  className="btn-3d bg-slate-900 hover:bg-slate-800 text-white font-bold h-8 px-2.5 rounded-md flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Menu className="w-4 h-4" />
                </button>

                <form onSubmit={handleAddParticipant} className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    type="text"
                    value={newParticipantName}
                    onChange={(e) => setNewParticipantName(e.target.value.replace(/[0-9]/g, '').toUpperCase())}
                    placeholder="KETIK NAMA PESERTA BARU..."
                    className="w-full h-8 px-2.5 text-[11px] sm:text-xs font-bold uppercase text-slate-900 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="submit"
                    className="btn-3d bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] h-8 px-3 rounded-md flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>TAMBAH</span>
                  </button>
                </form>
              </div>

              <div className="relative w-full sm:w-52">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.replace(/[0-9]/g, ''))}
                  placeholder="Cari nama peserta..."
                  className="w-full h-8 pl-7 pr-2.5 text-[11px] sm:text-xs bg-slate-100 border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </section>

          <main className="flex-1 max-w-7xl w-full mx-auto px-2 py-2 sm:px-4 sm:py-2.5 flex flex-col">
            <div className="mb-2 flex items-end justify-between bg-slate-100 border border-slate-300 rounded-md px-2.5 py-1.5 text-[10px] no-print gap-2 flex-wrap">
              <div className="flex items-end gap-1.5 flex-wrap">
                <span className="bg-slate-800 text-amber-300 border border-slate-700 h-7 px-2 rounded text-[9px] font-extrabold uppercase inline-flex items-center">
                  PERIODE
                </span>
                <div className="flex flex-col leading-none">
                  <span className="text-[8px] font-bold text-slate-600 mb-0.5">Mulai Tgl</span>
                  <input
                    type="date"
                    value={periodRange.start}
                    onChange={(e) => {
                      const next = { ...periodRange, start: e.target.value };
                      setPeriodRange(next);
                      setDoc(getMetaDocRef(), { periodRange: next }, { merge: true });
                    }}
                    className="h-7 bg-white border border-slate-300 rounded px-1.5 text-[9px] font-bold text-slate-800"
                  />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="text-[8px] font-bold text-slate-600 mb-0.5">Selesai Tgl</span>
                  <input
                    type="date"
                    value={periodRange.end}
                    onChange={(e) => {
                      const next = { ...periodRange, end: e.target.value };
                      setPeriodRange(next);
                      setDoc(getMetaDocRef(), { periodRange: next }, { merge: true });
                    }}
                    className="h-7 bg-white border border-slate-300 rounded px-1.5 text-[9px] font-bold text-slate-800"
                  />
                </div>

                <div
                  title={connectionStatus}
                  className={`flex items-center justify-center h-7 w-7 rounded border ${
                    connectionStatus === 'ONLINE'
                      ? 'bg-emerald-950/90 border-emerald-500/80'
                      : 'bg-amber-950/90 border-amber-600/80'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      connectionStatus === 'ONLINE' ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                    }`}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveArchive}
                  className="btn-3d bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[9px] h-7 px-2.5 rounded cursor-pointer"
                >
                  SIMPAN DATA
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubTab(isAllowanceTab ? 'CEKLIS' : 'UANG_JAJAN')}
                  className={`btn-3d text-white font-extrabold text-[9px] h-7 px-2.5 rounded cursor-pointer ${
                    isAllowanceTab ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isAllowanceTab ? 'Kembali ke Ceklis' : 'Beralih ke Uang Jajan'}
                </button>
              </div>
            </div>

            <div className="table-container bg-white border border-slate-300 rounded overflow-auto max-h-[calc(100vh-125px)] flex-1 relative">
              <table className="w-full border-collapse text-left select-none">
                <thead>
                  <tr className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
                    <th rowSpan={2} className="sticky-corner-no w-[28px] py-1 px-0.5 text-center border-b border-r border-slate-500">
                      NO
                    </th>
                    <th rowSpan={2} className="sticky-corner-name whitespace-nowrap py-1 px-1.5 text-left border-b border-r border-slate-500">
                      NAMA PESERTA
                    </th>
                    {!isAllowanceTab &&
                      DAY_COLUMNS.map((col, idx) => (
                        <th
                          key={col.key}
                          colSpan={2}
                          className={`sticky-header py-1 px-0.5 text-center border-b border-r border-slate-500 ${
                            weekDates[idx].isToday ? 'bg-blue-700' : 'bg-slate-600'
                          }`}
                        >
                          <div className="flex flex-col items-center leading-tight">
                            <span className="text-[10px] font-bold">{col.short}</span>
                            <span className="text-[7px] font-normal text-slate-200">{weekDates[idx].fullDateLabel}</span>
                          </div>
                        </th>
                      ))}
                    <th rowSpan={2} className="sticky-header bg-slate-600 min-w-[44px] py-1 px-1 text-center border-b border-r border-slate-500">
                      JMLH
                    </th>
                    <th rowSpan={2} className="sticky-header bg-slate-600 min-w-[68px] py-1 px-1.5 text-right border-b border-r border-slate-500">
                      RP 15.000
                    </th>
                    <th rowSpan={2} className="sticky-header bg-slate-600 min-w-[78px] py-1 px-1.5 text-right border-b border-r border-slate-500">
                      TOTAL
                    </th>
                    <th rowSpan={2} className="sticky-header bg-slate-600 min-w-[76px] py-1 px-1 text-center border-b border-r border-slate-500">
                      TTD
                    </th>
                    <th
                      rowSpan={2}
                      onClick={() => {
                        if (!isAllowanceTab) setShowQuickActionModal(true);
                      }}
                      className={`sticky-header bg-slate-600 min-w-[95px] py-1 px-1.5 text-left border-b border-slate-500 ${
                        !isAllowanceTab ? 'cursor-pointer hover:bg-slate-500' : ''
                      }`}
                    >
                      {isAllowanceTab ? (
                        <span>KET</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 underline decoration-amber-300 underline-offset-2">
                          <span>KET</span>
                          <span className="text-[8px] px-1 rounded bg-slate-700/80 text-amber-200 font-extrabold">MENU</span>
                        </span>
                      )}
                    </th>
                  </tr>
                  {!isAllowanceTab && (
                    <tr className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">
                      {DAY_COLUMNS.map((col) => (
                        <React.Fragment key={col.key}>
                          <th className="sticky-subheader min-w-[26px] py-0.5 text-center border-b border-r border-slate-500 bg-slate-500 text-white">
                            PG
                          </th>
                          <th className="sticky-subheader min-w-[26px] py-0.5 text-center border-b border-r border-slate-500 bg-slate-500 text-white">
                            SR
                          </th>
                        </React.Fragment>
                      ))}
                    </tr>
                  )}
                </thead>

                <tbody className="divide-y divide-slate-200 text-[11px] sm:text-xs">
                  {filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={isAllowanceTab ? 7 : 21} className="py-10 text-center text-slate-500 text-xs">
                        Belum ada peserta atau nama tidak ditemukan.
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.map((p, idx) => {
                      const rowCount = isAllowanceTab
                        ? getParticipantAllowanceDayCount(p.checks)
                        : ALL_SLOT_KEYS.reduce((acc, k) => acc + (p.checks?.[k] ? 1 : 0), 0);
                      const pMarks = statusMarks[p.id] || {};

                      return (
                        <tr key={p.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="sticky-col-no py-1 px-0.5 text-center font-bold text-slate-500 text-[10px] border-r border-slate-200">
                            {idx + 1}
                          </td>
                          <td className="sticky-col-name py-1 px-1.5 font-bold text-slate-900 text-[10px] sm:text-[11px] uppercase whitespace-nowrap border-r border-slate-300">
                            {p.name}
                          </td>
                          {!isAllowanceTab &&
                            DAY_COLUMNS.map((col) => {
                              const markCat = pMarks[col.key];
                              const markCls = markCat && STATUS_STYLES[markCat] ? STATUS_STYLES[markCat].cellClass : '';
                              return (
                                <React.Fragment key={col.key}>
                                  <td className={`py-0.5 text-center border-r border-slate-200 ${markCls}`}>
                                    <input
                                      type="checkbox"
                                      className="custom-checkbox slot-1"
                                      checked={!!p.checks?.[col.slot1]}
                                      onChange={(e) => handleToggleCheckbox(p, col.slot1, e.target.checked)}
                                    />
                                  </td>
                                  <td className={`py-0.5 text-center border-r border-slate-300 ${markCls}`}>
                                    <input
                                      type="checkbox"
                                      className="custom-checkbox slot-2"
                                      checked={!!p.checks?.[col.slot2]}
                                      onChange={(e) => handleToggleCheckbox(p, col.slot2, e.target.checked)}
                                    />
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          <td className="py-0.5 px-1 text-center font-bold text-blue-900 text-[10px] border-r border-slate-200">
                            {rowCount}
                          </td>
                          <td className="py-0.5 px-1.5 text-right text-slate-700 text-[10px] whitespace-nowrap border-r border-slate-200">
                            {formatRupiah(UNIT_RATE)}
                          </td>
                          <td className="py-0.5 px-1.5 text-right font-bold text-emerald-800 text-[10px] whitespace-nowrap border-r border-slate-200">
                            {formatRupiah(rowCount * UNIT_RATE)}
                          </td>
                          <td className="py-0.5 px-1 text-center border-r border-slate-200">
                            {p.ttdDataUrl ? (
                              <img
                                src={p.ttdDataUrl}
                                alt="TTD"
                                onClick={() => setPreviewTtd({ name: p.name, url: p.ttdDataUrl })}
                                className="h-6 w-auto mx-auto object-contain cursor-pointer"
                              />
                            ) : (
                              <span className="text-[9px] text-slate-400">{idx + 1}. ......</span>
                            )}
                          </td>
                          <td className="py-0.5 px-1">
                            <input
                              type="text"
                              defaultValue={p.ket}
                              placeholder="..."
                              onBlur={(e) =>
                                updateDoc(getParticipantDocRef(p.id), { ket: e.target.value.trim(), updatedAt: Date.now() })
                              }
                              className="w-full min-w-[85px] bg-transparent focus:bg-white border border-transparent focus:border-blue-500 rounded px-1 py-0.5 text-[10px]"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {filteredParticipants.length > 0 && (
                  <tfoot className="bg-slate-100 border-t border-slate-400 font-bold text-[10px] sm:text-[11px] text-slate-800 sticky bottom-0 z-20">
                    <tr>
                      <td className="sticky-col-no bg-slate-200 py-1 text-center border-r border-slate-300">-</td>
                      <td className="sticky-col-name bg-slate-200 py-1 px-2 text-left font-bold uppercase text-[9px] border-r border-slate-300">
                        {isAllowanceTab ? 'TOTAL' : 'REKAP HARIAN'}
                      </td>
                      {!isAllowanceTab &&
                        DAY_COLUMNS.map((col) => (
                          <React.Fragment key={col.key}>
                            <td className="py-1 text-center text-emerald-800 border-r border-slate-300">
                              {participants.filter((p) => p.checks?.[col.slot1]).length}
                            </td>
                            <td className="py-1 text-center text-sky-800 border-r border-slate-300">
                              {participants.filter((p) => p.checks?.[col.slot2]).length}
                            </td>
                          </React.Fragment>
                        ))}
                      <td className="py-1 px-1 text-center text-emerald-900 bg-emerald-100 border-r border-slate-300">
                        {participants.reduce(
                          (sum, p) =>
                            sum +
                            (isAllowanceTab
                              ? getParticipantAllowanceDayCount(p.checks)
                              : ALL_SLOT_KEYS.reduce((a, k) => a + (p.checks?.[k] ? 1 : 0), 0)),
                          0
                        )}
                      </td>
                      <td className="py-1 px-1.5 text-right bg-slate-200 border-r border-slate-300">
                        {formatRupiah(UNIT_RATE)}
                      </td>
                      <td className="py-1 px-1.5 text-right font-extrabold text-emerald-950 bg-emerald-200 border-r border-slate-300">
                        {formatRupiah(
                          participants.reduce(
                            (sum, p) =>
                              sum +
                              (isAllowanceTab
                                ? getParticipantAllowanceDayCount(p.checks)
                                : ALL_SLOT_KEYS.reduce((a, k) => a + (p.checks?.[k] ? 1 : 0), 0)),
                            0
                          ) * UNIT_RATE
                        )}
                      </td>
                      <td className="bg-slate-200 border-r border-slate-300" />
                      <td className="bg-slate-200" />
                    </tr>

                    {!isAllowanceTab && (
                      <tr className="bg-amber-50/90">
                        <td className="sticky-col-no bg-amber-100 py-1 text-center border-r border-amber-200">-</td>
                        <td className="sticky-col-name bg-amber-100 py-1 px-2 text-left font-extrabold text-amber-950 uppercase text-[9px] border-r border-amber-200">
                          PESANAN HARIAN
                        </td>
                        {DAY_COLUMNS.map((col) => (
                          <td key={col.key} colSpan={2} className="py-0.5 px-0.5 text-center border-r border-amber-200">
                            <input
                              type="text"
                              value={dailyOrders[col.key] || ''}
                              placeholder="70/90"
                              onChange={(e) => {
                                const next = { ...dailyOrders, [col.key]: e.target.value };
                                setDailyOrders(next);
                                setDoc(getMetaDocRef(), { dailyOrders: next }, { merge: true });
                              }}
                              className="w-full min-w-[44px] bg-white border border-amber-300 rounded px-1 py-0.5 text-center text-[10px] font-bold text-amber-950"
                            />
                          </td>
                        ))}
                        <td className="py-1 text-center font-extrabold text-amber-950 bg-amber-200 border-r border-amber-300">
                          {DAY_COLUMNS.reduce((s, c) => s + parseOrderCellValue(dailyOrders[c.key]), 0)}
                        </td>
                        <td className="py-1 px-1.5 text-right bg-amber-100 border-r border-amber-200">
                          {formatRupiah(UNIT_RATE)}
                        </td>
                        <td className="py-1 px-1.5 text-right font-extrabold text-amber-950 bg-amber-200 border-r border-amber-300">
                          {formatRupiah(
                            DAY_COLUMNS.reduce((s, c) => s + parseOrderCellValue(dailyOrders[c.key]), 0) * UNIT_RATE
                          )}
                        </td>
                        <td className="bg-amber-100 border-r border-amber-200" />
                        <td className="bg-amber-100" />
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            </div>
          </main>
        </div>
      )}

      {/* Side Navigation Drawer */}
      {isDrawerOpen && (
        <>
          <div onClick={() => setIsDrawerOpen(false)} className="fixed inset-0 z-40 bg-slate-950/60 no-print" />
          <aside className="fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[85vw] bg-white border-r border-slate-200 shadow-2xl flex flex-col justify-between p-4 no-print">
            <div className="space-y-3 overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <h2 className="text-sm font-extrabold text-slate-900">Menu Navigasi</h2>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-extrabold text-slate-800 uppercase truncate">
                    ROLE: {loggedInAdminName}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded text-[9px] text-slate-100">
                    <Users className="w-2.5 h-2.5 text-sky-400" />
                    {onlineCount}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdminLoggedIn(false);
                    setIsDrawerOpen(false);
                  }}
                  className="bg-rose-600 text-white font-bold text-[11px] px-3 py-1 rounded-md cursor-pointer"
                >
                  Keluar
                </button>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setShowManageAdminModal(true);
                  }}
                  className="w-full bg-indigo-600 text-white font-bold text-xs py-2.5 px-3 rounded-lg flex justify-between cursor-pointer"
                >
                  <span>Menu Admin</span>
                  <span className="text-[10px] bg-indigo-800 px-1.5 py-0.5 rounded">{Math.max(1, admins.length)}</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const next = !isPortalLocked;
                    setIsPortalLocked(next);
                    setIsDrawerOpen(false);
                    await setDoc(getMetaDocRef(), { portalNameInputLocked: next }, { merge: true });
                    notify(next ? 'Kolom nama dikunci' : 'Kolom nama dibuka');
                  }}
                  className="w-full bg-amber-600 text-white font-bold text-xs py-2.5 px-3 rounded-lg text-left cursor-pointer"
                >
                  {isPortalLocked ? '🔓 Buka Kunci Kolom Nama Modal' : '🔒 Kunci Kolom Nama Modal'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setTimeout(() => window.print(), 150);
                  }}
                  className="w-full bg-slate-800 text-white font-bold text-xs py-2.5 px-3 rounded-lg text-left cursor-pointer"
                >
                  🖨️ Cetak / Print
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setShowArchiveModal(true);
                  }}
                  className="w-full bg-amber-600 text-white font-bold text-xs py-2.5 px-3 rounded-lg text-left cursor-pointer"
                >
                  Arsip Rekapan ({archives.length})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setShowBulkModal(true);
                  }}
                  className="w-full bg-slate-700 text-white font-bold text-xs py-2 px-3 rounded-lg text-left cursor-pointer"
                >
                  + Tambah Banyak Nama
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Modal Login Admin */}
      {showAdminLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90">
          <div className="bg-[#161e2e] border border-slate-700 rounded-xl max-w-sm w-full p-4 shadow-2xl text-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold uppercase">Login Akses Admin</h3>
              <button type="button" onClick={() => setShowAdminLoginModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-3">
              <input
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value.replace(/[0-9]/g, '').toUpperCase())}
                placeholder="NAMA ADMIN"
                required
                className="w-full bg-[#1e2736] border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold uppercase text-white"
              />
              <input
                type="password"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="KODE PIN (11111)"
                required
                className="w-full bg-[#1e2736] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white"
              />
              {loginError && <p className="text-[11px] text-rose-400">{loginError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdminLoginModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button type="submit" className="px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 cursor-pointer">
                  Masuk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal TTD Canvas */}
      {showTtdModal && selectedParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90">
          <div className="bg-[#161e2e] border border-slate-700 rounded-xl max-w-md w-full p-4 text-white">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-extrabold uppercase">TTD - {selectedParticipant.name}</h3>
              <button type="button" onClick={() => setShowTtdModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <canvas
              ref={ttdCanvasRef}
              width={360}
              height={160}
              onMouseDown={(e) => {
                const ctx = ttdCanvasRef.current.getContext('2d');
                const rect = ttdCanvasRef.current.getBoundingClientRect();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#0f172a';
                ctx.beginPath();
                ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                isDrawingRef.current = true;
                hasDrawnRef.current = true;
              }}
              onMouseMove={(e) => {
                if (!isDrawingRef.current) return;
                const ctx = ttdCanvasRef.current.getContext('2d');
                const rect = ttdCanvasRef.current.getBoundingClientRect();
                ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
                ctx.stroke();
              }}
              onMouseUp={() => {
                isDrawingRef.current = false;
              }}
              className="w-full h-40 bg-white rounded-lg mb-3 cursor-crosshair"
            />
            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => {
                  const ctx = ttdCanvasRef.current.getContext('2d');
                  ctx.clearRect(0, 0, ttdCanvasRef.current.width, ttdCanvasRef.current.height);
                  hasDrawnRef.current = false;
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 cursor-pointer"
              >
                Hapus
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!hasDrawnRef.current) return notify('Goreskan tanda tangan terlebih dahulu', true);
                  const url = ttdCanvasRef.current.toDataURL('image/png');
                  await updateDoc(getParticipantDocRef(selectedParticipant.id), { ttdDataUrl: url, updatedAt: Date.now() });
                  setShowTtdModal(false);
                  notify('TTD berhasil disimpan');
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 cursor-pointer"
              >
                Simpan TTD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Menu Aksi Cepat (Hanya untuk Ceklis Harian) */}
      {showQuickActionModal && !isAllowanceTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75">
          <div className="bg-white border border-slate-300 rounded-xl max-w-xs w-full p-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200">
              <h3 className="text-sm font-extrabold text-slate-900">Menu Aksi Cepat</h3>
              <button type="button" onClick={() => setShowQuickActionModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowQuickActionModal(false);
                  setShowQuickCheckModal(true);
                }}
                className="w-full py-2.5 px-3 rounded-lg text-xs font-extrabold uppercase bg-sky-600 text-white flex justify-between cursor-pointer"
              >
                <span>CEKLIS HARI</span>
                <span className="text-[10px] bg-sky-800 px-1.5 py-0.5 rounded">PG &amp; SR</span>
              </button>
              {Object.keys(STATUS_STYLES).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setShowQuickActionModal(false);
                    setStatusModalCategory(cat);
                    setStatusNoUrut('');
                    setStatusSelectedDays([]);
                  }}
                  className={`w-full py-2.5 px-3 rounded-lg text-xs font-extrabold uppercase cursor-pointer ${STATUS_STYLES[cat].btn}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Input Status Harian */}
      {statusModalCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80">
          <div className="bg-white rounded-xl max-w-md w-full p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold">Input Status: {statusModalCategory}</h3>
              <button type="button" onClick={() => setStatusModalCategory(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveStatusInput} className="space-y-3">
              <input
                type="text"
                value={statusNoUrut}
                onChange={(e) => setStatusNoUrut(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="No Urut Peserta (contoh: 1)"
                required
                className="w-full px-3 py-2 text-xs border border-cyan-500 rounded-lg"
              />
              <div className="grid grid-cols-2 gap-2">
                {DAY_COLUMNS.map((c) => {
                  const active = statusSelectedDays.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() =>
                        setStatusSelectedDays((prev) =>
                          prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]
                        )
                      }
                      className={`py-2 px-3 rounded-lg border text-xs font-extrabold cursor-pointer ${
                        active ? 'bg-teal-600 text-white' : 'bg-slate-50 text-slate-800'
                      }`}
                    >
                      {active ? '✓ ' : ''}
                      {c.full}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setStatusModalCategory(null)} className="px-4 py-2 text-xs font-bold bg-slate-100 rounded-lg cursor-pointer">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-bold bg-teal-600 text-white rounded-lg cursor-pointer">
                  Simpan {statusModalCategory}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ceklis Hari Cepat */}
      {showQuickCheckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80">
          <div className="bg-white rounded-xl max-w-md w-full p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold uppercase">Ceklis Hari Cepat</h3>
              <button type="button" onClick={() => setShowQuickCheckModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleApplyQuickCheck} className="space-y-3">
              <input
                type="text"
                value={quickCheckNoUrut}
                onChange={(e) => setQuickCheckNoUrut(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="No Urut (kosongkan = semua peserta)"
                className="w-full px-3 py-2 text-xs border border-sky-500 rounded-lg"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 bg-slate-50 border rounded-lg px-3 py-2 text-xs font-bold">
                  <input type="checkbox" checked={quickCheckPagi} onChange={(e) => setQuickCheckPagi(e.target.checked)} />
                  <span>PAGI (PG)</span>
                </label>
                <label className="flex items-center gap-2 bg-slate-50 border rounded-lg px-3 py-2 text-xs font-bold">
                  <input type="checkbox" checked={quickCheckSore} onChange={(e) => setQuickCheckSore(e.target.checked)} />
                  <span>SORE (SR)</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DAY_COLUMNS.map((c) => {
                  const active = quickCheckDays.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() =>
                        setQuickCheckDays((prev) =>
                          prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key]
                        )
                      }
                      className={`py-2 px-3 rounded-lg border text-xs font-extrabold cursor-pointer ${
                        active ? 'bg-sky-600 text-white' : 'bg-slate-50 text-slate-800'
                      }`}
                    >
                      {active ? '✓ ' : ''}
                      {c.full}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowQuickCheckModal(false)} className="px-4 py-2 text-xs font-bold bg-slate-100 rounded-lg cursor-pointer">
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-bold bg-sky-600 text-white rounded-lg cursor-pointer">
                  Terapkan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Kelola Admin */}
      {showManageAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80">
          <div className="bg-white rounded-lg max-w-md w-full p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold uppercase">Kelola Admin &amp; PIN</h3>
              <button type="button" onClick={() => setShowManageAdminModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newAdminName.trim() || newAdminPin.length < 4) return;
                await addDoc(getAdminsColRef(), {
                  name: newAdminName.trim().toUpperCase(),
                  pin: newAdminPin.trim(),
                  createdAt: Date.now()
                });
                setNewAdminName('');
                setNewAdminPin('');
                notify('Admin baru ditambahkan');
              }}
              className="space-y-2 mb-3"
            >
              <input
                type="text"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value.replace(/[0-9]/g, '').toUpperCase())}
                placeholder="NAMA ADMIN"
                className="w-full px-2.5 py-1.5 text-xs font-bold uppercase border rounded"
              />
              <input
                type="text"
                value={newAdminPin}
                onChange={(e) => setNewAdminPin(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="PIN (4-8 ANGKA)"
                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold border rounded"
              />
              <button type="submit" className="w-full py-1.5 bg-indigo-600 text-white text-xs font-bold rounded cursor-pointer">
                + Simpan Admin
              </button>
            </form>
            <div className="max-h-40 overflow-y-auto divide-y border rounded">
              {admins.map((a) => (
                <div key={a.id} className="px-3 py-2 flex justify-between items-center text-xs">
                  <span>
                    <strong>{a.name}</strong> (PIN: {a.pin})
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteDoc(getAdminDocRef(a.id))}
                    className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-bold cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Arsip Rekapan */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75">
          <div className="bg-white rounded-xl max-w-xl w-full p-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 mb-3 border-b">
              <h3 className="text-sm font-extrabold">Menu Arsip Rekapan</h3>
              <button type="button" onClick={() => setShowArchiveModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {archives.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Belum ada arsip tersimpan.</p>
              ) : (
                archives.map((arc) => (
                  <div key={arc.id} className="border rounded-lg p-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-extrabold text-blue-950">{arc.periodLabel}</p>
                      <p className="text-[10px] text-slate-500">
                        {arc.totalParticipants} Peserta • {formatRupiah(arc.totalAmount)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteDoc(getArchiveDocRef(arc.id))}
                      className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded text-[11px] font-bold cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Banyak Nama */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80">
          <div className="bg-white rounded-lg max-w-md w-full p-4 shadow-xl">
            <h3 className="text-sm font-extrabold uppercase mb-2">Tambah Banyak Peserta</h3>
            <textarea
              rows={5}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value.replace(/[0-9]/g, '').toUpperCase())}
              placeholder="Satu nama per baris..."
              className="w-full p-2 text-xs font-bold uppercase border rounded mb-3"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowBulkModal(false)} className="px-3 py-1.5 text-xs font-bold bg-slate-200 rounded cursor-pointer">
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const lines = [...new Set(bulkText.split('\n').map((l) => l.trim()).filter(Boolean))];
                  if (lines.length === 0 || !currentUser) return;
                  const batch = writeBatch(db);
                  lines.forEach((name, i) => {
                    batch.set(doc(getParticipantsColRef()), {
                      name,
                      checks: getEmptyChecksObject(),
                      ket: '',
                      ttdDataUrl: '',
                      createdAt: Date.now() + i,
                      createdBy: currentUser.uid
                    });
                  });
                  await batch.commit();
                  setBulkText('');
                  setShowBulkModal(false);
                  notify(`${lines.length} peserta ditambahkan`);
                }}
                className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded cursor-pointer"
              >
                Simpan Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview TTD */}
      {previewTtd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80">
          <div className="bg-white rounded-lg max-w-sm w-full p-4">
            <div className="flex justify-between mb-2">
              <h3 className="text-xs font-extrabold uppercase">TTD - {previewTtd.name}</h3>
              <button type="button" onClick={() => setPreviewTtd(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <img src={previewTtd.url} alt="TTD" className="max-h-36 mx-auto" />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-3 right-3 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded shadow-lg text-[11px] font-bold text-white ${
            toast.isError ? 'bg-red-700' : 'bg-slate-900'
          }`}
        >
          {toast.isError ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
                                         }
