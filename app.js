import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getDatabase, 
  ref, 
  onValue, 
  set, 
  update, 
  push, 
  remove, 
  runTransaction 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Target Firebase Configuration matching ind-tournament-bb712
const firebaseConfig = {
  apiKey: "AIzaSyDrk5WrWV90mu5mljpkg9x-VcP2pcjrDvQ",
  authDomain: "ind-tournament-bb712.firebaseapp.com",
  databaseURL: "https://ind-tournament-bb712-default-rtdb.firebaseio.com",
  projectId: "ind-tournament-bb712",
  storageBucket: "ind-tournament-bb712.appspot.com",
  messagingSenderId: "415857274383",
  appId: "1:415857274383:android:986981b62e16719a80bd7a"
};

// Initialize Firebase App & Realtime Database
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app, firebaseConfig.databaseURL);

let currentAdminUser = null;
let allTournaments = [];
let allUsers = [];
let allCategories = [];
let allBanners = [];
let allTransactions = []; // Unified list of { userId, txId, ...txData }
let allTickets = [];
let pendingOnlyFilter = true;

// DOM References
const authModal = document.getElementById("auth-modal");
const adminShell = document.getElementById("admin-shell");
const googleLoginBtn = document.getElementById("google-login-btn");
const authError = document.getElementById("auth-error");
const logoutBtn = document.getElementById("logout-btn");

const adminAvatar = document.getElementById("admin-avatar");
const adminName = document.getElementById("admin-name");
const adminEmail = document.getElementById("admin-email");
const profileEmail = document.getElementById("profile-email");

// Navigation Tabs
const navItems = document.querySelectorAll(".nav-item");
const tabPanes = document.querySelectorAll(".tab-pane");
const pageTitle = document.getElementById("page-title");
const mobileMenuBtn = document.getElementById("mobile-menu-btn");
const sidebar = document.querySelector(".sidebar");

// Modals
const tournamentModal = document.getElementById("tournament-modal");
const addTournamentBtn = document.getElementById("add-tournament-btn");
const quickCreateTournamentBtn = document.getElementById("quick-create-tournament-btn");
const tournamentForm = document.getElementById("tournament-form");
const closeModalBtns = document.querySelectorAll(".close-modal-btn");

const roomModal = document.getElementById("room-modal");
const roomPublishForm = document.getElementById("room-publish-form");
const closeRoomModalBtns = document.querySelectorAll(".close-room-modal-btn");

const categoryModal = document.getElementById("category-modal");
const addCategoryBtn = document.getElementById("add-category-btn");
const categoryForm = document.getElementById("category-form");
const closeCatModalBtns = document.querySelectorAll(".close-cat-modal-btn");

const bannerModal = document.getElementById("banner-modal");
const addBannerBtn = document.getElementById("add-banner-btn");
const bannerForm = document.getElementById("banner-form");
const closeBannerModalBtns = document.querySelectorAll(".close-banner-modal-btn");

const replyModal = document.getElementById("reply-modal");
const ticketReplyForm = document.getElementById("ticket-reply-form");
const closeReplyModalBtns = document.querySelectorAll(".close-reply-modal-btn");

// App Code & Settings
const appcodeTextarea = document.getElementById("appcode-textarea");
const saveAppcodeBtn = document.getElementById("save-appcode-btn");
const settingsForm = document.getElementById("settings-form");

// -------------------------------------------------------------
// Authentication & Strict Custom Claims Verification
// (No hardcoded email bypasses permitted)
// -------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      // Force refresh of ID token claims
      const tokenResult = await user.getIdTokenResult(true);
      const isCustomClaimAdmin = tokenResult.claims.admin === true;

      if (isCustomClaimAdmin) {
        currentAdminUser = user;
        showAdminShell(user);
        initRealtimeDatabaseListeners();
      } else {
        await signOut(auth);
        showAuthError(`Access Denied: Account "${user.email}" does not possess verified administrator Custom Claims ({ admin: true }). Run "node backend/set_admin_claims.js ${user.uid}" on your trusted server.`);
      }
    } catch (e) {
      console.error("Auth claim check failed:", e);
      showAuthError("Failed to verify administrator privileges: " + e.message);
    }
  } else {
    currentAdminUser = null;
    showAuthModal();
  }
});

function showAdminShell(user) {
  authModal.style.display = "none";
  adminShell.style.display = "flex";
  adminAvatar.src = user.photoURL || "https://api.dicebear.com/7.x/bottts/svg?seed=" + user.uid;
  adminName.textContent = user.displayName || "Administrator";
  adminEmail.textContent = user.email || "admin@indtmt.com";
  profileEmail.textContent = user.email || "admin@indtmt.com";
}

function showAuthModal() {
  authModal.style.display = "flex";
  adminShell.style.display = "none";
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.style.display = "block";
}

googleLoginBtn.addEventListener("click", async () => {
  try {
    authError.style.display = "none";
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    showAuthError("Sign-in failed: " + err.message);
  }
});

logoutBtn.addEventListener("click", () => {
  signOut(auth);
});

// -------------------------------------------------------------
// Navigation
// -------------------------------------------------------------
navItems.forEach(item => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const tabId = item.getAttribute("data-tab");
    switchTab(tabId);
    if (window.innerWidth <= 900) {
      sidebar.classList.remove("open");
    }
  });
});

function switchTab(tabId) {
  navItems.forEach(nav => {
    nav.classList.toggle("active", nav.getAttribute("data-tab") === tabId);
  });
  tabPanes.forEach(pane => {
    pane.classList.toggle("active", pane.id === `tab-${tabId}`);
  });
  pageTitle.textContent = tabId.charAt(0).toUpperCase() + tabId.slice(1).replace("-", " ");
}

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });
}

// -------------------------------------------------------------
// Realtime Database Listeners
// -------------------------------------------------------------
function initRealtimeDatabaseListeners() {
  // 1. Matches / Tournaments
  onValue(ref(db, "matches"), (snapshot) => {
    allTournaments = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const val = child.val();
        val.key = child.key;
        allTournaments.push(val);
      });
    }
    renderTournaments();
    renderDashboardStats();
    renderResultsTable();
  }, (err) => {
    console.error("Matches listener error:", err);
  });

  // 2. Users
  onValue(ref(db, "users"), (snapshot) => {
    allUsers = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const val = child.val();
        val.uid = child.key;
        allUsers.push(val);
      });
    }
    renderUsers();
    renderDashboardStats();
    renderLeaderboard();
    populateRewardUserSelect();
  }, (err) => {
    console.error("Users listener error:", err);
  });

  // 3. Categories
  onValue(ref(db, "categories"), (snapshot) => {
    allCategories = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const val = child.val();
        val.key = child.key;
        allCategories.push(val);
      });
    }
    renderCategories();
  }, (err) => {
    console.error("Categories listener error:", err);
  });

  // 4. Banners
  onValue(ref(db, "banners"), (snapshot) => {
    allBanners = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const val = child.val();
        val.key = child.key;
        allBanners.push(val);
      });
    }
    renderBanners();
  }, (err) => {
    console.error("Banners listener error:", err);
  });

  // 5. Transactions across all users
  onValue(ref(db, "transactions"), (snapshot) => {
    allTransactions = [];
    if (snapshot.exists()) {
      snapshot.forEach(userChild => {
        const userId = userChild.key;
        userChild.forEach(txChild => {
          const val = txChild.val();
          val.txId = txChild.key;
          val.userId = userId;
          allTransactions.push(val);
        });
      });
    }
    renderFinanceTable();
    renderDashboardStats();
  }, (err) => {
    console.error("Transactions listener error:", err);
  });

  // 6. Support Tickets
  onValue(ref(db, "support_tickets"), (snapshot) => {
    allTickets = [];
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        const val = child.val();
        val.key = child.key;
        allTickets.push(val);
      });
    }
    renderTickets();
  }, (err) => {
    console.error("Support tickets listener error:", err);
  });

  // 7. App Settings
  onValue(ref(db, "app_settings"), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      if (document.getElementById("setting-appname")) document.getElementById("setting-appname").value = data.appName || "IND TMT";
      if (document.getElementById("setting-appversion")) document.getElementById("setting-appversion").value = data.appVersion || "1.0.0";
      if (document.getElementById("setting-whatsapp")) document.getElementById("setting-whatsapp").value = data.whatsapp || "";
      if (document.getElementById("setting-telegram")) document.getElementById("setting-telegram").value = data.telegram || "";
      if (document.getElementById("setting-notice")) document.getElementById("setting-notice").value = data.notice || "";
    }
  }, (err) => {
    console.error("Settings listener error:", err);
  });

  // 8. User App Code Editor (/app_code)
  onValue(ref(db, "app_code"), (snapshot) => {
    if (snapshot.exists()) {
      const val = snapshot.val();
      if (typeof val === "string") {
        appcodeTextarea.value = val;
      } else {
        appcodeTextarea.value = JSON.stringify(val, null, 2);
      }
    } else {
      appcodeTextarea.value = "{\n  \"version\": \"1.0.0\",\n  \"features\": {\n    \"clash_squad\": true,\n    \"esports_trivia\": true\n  }\n}";
    }
  }, (err) => {
    console.error("App code listener error:", err);
  });
}

// -------------------------------------------------------------
// Dashboard Rendering
// -------------------------------------------------------------
function renderDashboardStats() {
  document.getElementById("stat-users").textContent = allUsers.length;
  const activeCount = allTournaments.filter(t => t.status === "Active" || t.status === "upcoming" || t.status === "live").length;
  document.getElementById("stat-tournaments").textContent = activeCount;

  const totalPoints = allUsers.reduce((sum, u) => sum + (Number(u.deposit || 0) + Number(u.winning || 0)), 0);
  document.getElementById("stat-points").textContent = "₹" + totalPoints.toLocaleString();

  const pendingDeposits = allTransactions.filter(tx => tx.type === "Deposit" && tx.status === "Pending").length;
  document.getElementById("stat-pending-deposits").textContent = pendingDeposits;

  const tbody = document.getElementById("dashboard-tournaments-tbody");
  if (allTournaments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">No matches currently scheduled.</td></tr>`;
    return;
  }
  tbody.innerHTML = allTournaments.slice(0, 5).map(t => `
    <tr>
      <td><strong>${escapeHtml(t.title || "Match")}</strong></td>
      <td>${escapeHtml(t.categoryName || t.type || "Solo")} • ${escapeHtml(t.map || "Bermuda")}</td>
      <td>${escapeHtml(t.time || "TBD")}</td>
      <td>${t.joined || 0} / ${t.total || 48}</td>
      <td><span class="badge ${t.status === 'Completed' ? 'badge-success' : 'badge-primary'}">${escapeHtml(t.status || 'Active')}</span></td>
      <td><span class="badge badge-success">Protected in /match_rooms</span></td>
    </tr>
  `).join("");
}

// -------------------------------------------------------------
// Users Management
// -------------------------------------------------------------
function renderUsers() {
  const tbody = document.getElementById("users-tbody");
  const query = (document.getElementById("user-search")?.value || "").toLowerCase();

  const filtered = allUsers.filter(u => 
    (u.username && u.username.toLowerCase().includes(query)) ||
    (u.email && u.email.toLowerCase().includes(query)) ||
    (u.phone && u.phone.includes(query))
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">No matching players found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${u.photoUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + u.uid}" style="width: 28px; height: 28px; border-radius: 50%;">
          <strong>${escapeHtml(u.username || "Gamer")}</strong>
        </div>
      </td>
      <td>${escapeHtml(u.email || u.phone || "No Email")}</td>
      <td>₹${u.deposit || 0}</td>
      <td><strong style="color: #F59E0B;">₹${u.winning || 0}</strong></td>
      <td><code>${escapeHtml(u.referralCode || "N/A")}</code></td>
      <td>
        <span class="badge ${u.isBanned ? 'badge-danger' : 'badge-success'}">
          ${u.isBanned ? 'BANNED' : 'ACTIVE'}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-sm ${u.isBanned ? 'btn-success' : 'btn-warning'}" onclick="toggleBanUser('${u.uid}', ${!u.isBanned})">
            ${u.isBanned ? 'Unban' : 'Ban'}
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteUserSafely('${u.uid}', '${escapeHtml(u.username || 'User')}')">
            Remove
          </button>
        </div>
      </td>
    </tr>
  `).join("");
}

window.toggleBanUser = async (uid, shouldBan) => {
  try {
    await update(ref(db, `users/${uid}`), { isBanned: shouldBan });
    alert(`User ${shouldBan ? 'suspended/banned' : 'reactivated'} successfully.`);
  } catch (err) {
    alert("Operation failed: " + err.message);
  }
};

window.deleteUserSafely = async (uid, username) => {
  const confirmed = confirm(`CRITICAL: Are you sure you want to permanently delete player "${username}" (${uid}) from Firebase Realtime Database?`);
  if (!confirmed) return;
  try {
    await remove(ref(db, `users/${uid}`));
    alert(`Player ${username} removed successfully.`);
  } catch (err) {
    alert("Failed to remove user: " + err.message);
  }
};

document.getElementById("user-search")?.addEventListener("input", renderUsers);

// -------------------------------------------------------------
// Tournaments Management
// (Never writes passwords to public /matches/)
// -------------------------------------------------------------
function renderTournaments() {
  const tbody = document.getElementById("tournaments-tbody");
  if (allTournaments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center">No tournaments found. Create one above!</td></tr>`;
    return;
  }

  tbody.innerHTML = allTournaments.map(t => `
    <tr>
      <td><strong>${escapeHtml(t.title || "Match")}</strong></td>
      <td>${escapeHtml(t.categoryName || t.type || "Solo")} • ${escapeHtml(t.map || "Bermuda")}</td>
      <td>${escapeHtml(t.time || "TBD")}</td>
      <td>${t.entry === 0 ? '<span class="badge badge-success">FREE</span>' : '₹' + t.entry}</td>
      <td>₹${t.total_prize || 0}</td>
      <td>${t.joined || 0} / ${t.total || 48}</td>
      <td><span class="badge ${t.status === 'Completed' ? 'badge-success' : 'badge-primary'}">${escapeHtml(t.status || 'Active')}</span></td>
      <td>
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-sm btn-primary" onclick="openRoomModal('${t.key}')">Room / Result</button>
          <button class="btn btn-sm btn-danger" onclick="deleteTournament('${t.key}', '${escapeHtml(t.title)}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

addTournamentBtn.addEventListener("click", () => {
  tournamentForm.reset();
  document.getElementById("modal-tournament-id").value = "";
  document.getElementById("modal-title").textContent = "Create New Tournament";
  tournamentModal.style.display = "flex";
});

if (quickCreateTournamentBtn) {
  quickCreateTournamentBtn.addEventListener("click", () => {
    addTournamentBtn.click();
  });
}

closeModalBtns.forEach(btn => btn.addEventListener("click", () => {
  tournamentModal.style.display = "none";
}));

tournamentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("modal-tournament-id").value;
  const title = document.getElementById("form-t-title").value.trim();
  const categoryName = document.getElementById("form-t-category").value.trim();
  const type = document.getElementById("form-t-type").value;
  const map = document.getElementById("form-t-map").value.trim();
  const time = document.getElementById("form-t-time").value.trim();
  const entry = Number(document.getElementById("form-t-entry").value || 0);
  const total_prize = Number(document.getElementById("form-t-prize").value || 0);
  const per_kill = Number(document.getElementById("form-t-perkill").value || 0);
  const total = Number(document.getElementById("form-t-slots").value || 48);

  const room_id = document.getElementById("form-t-roomid").value.trim() || null;
  const room_pass = document.getElementById("form-t-roompass").value.trim() || null;

  try {
    let matchKey = id;
    if (id) {
      await update(ref(db, `matches/${id}`), {
        title, categoryName, type, map, time, entry, total_prize, per_kill, total
      });
    } else {
      const newRef = push(ref(db, "matches"));
      matchKey = newRef.key;
      await set(newRef, {
        id: Date.now(),
        title,
        categoryId: "cat_default",
        categoryName,
        type,
        gameModeName: `${type} - ${map}`,
        map,
        time,
        entry,
        total_prize,
        per_kill,
        total,
        joined: 0,
        status: "Active",
        timestamp: Date.now()
      });
    }

    // Save room credentials in secure /match_rooms/ (Zero exposure in public matches)
    if (room_id || room_pass) {
      await set(ref(db, `match_rooms/${matchKey}`), {
        roomId: room_id,
        roomPass: room_pass,
        publishedAt: Date.now()
      });
    }

    alert("Tournament saved successfully!");
    tournamentModal.style.display = "none";
  } catch (err) {
    alert("Failed to save tournament: " + err.message);
  }
});

window.deleteTournament = async (key, title) => {
  if (!confirm(`Are you sure you want to delete tournament "${title}"?`)) return;
  try {
    await remove(ref(db, `matches/${key}`));
    await remove(ref(db, `match_rooms/${key}`));
    await remove(ref(db, `match_participants/${key}`));
    alert("Tournament deleted.");
  } catch (err) {
    alert("Error deleting: " + err.message);
  }
};

// -------------------------------------------------------------
// Finance & Deposit / Withdrawal Verification
// (Strict validation preventing duplicate approvals/refunds)
// -------------------------------------------------------------
function renderFinanceTable() {
  const tbody = document.getElementById("finance-tbody");
  const filtered = pendingOnlyFilter 
    ? allTransactions.filter(tx => tx.status === "Pending")
    : allTransactions;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center">No ${pendingOnlyFilter ? 'pending' : ''} financial requests found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(tx => `
    <tr>
      <td><code>${escapeHtml(tx.userId.substring(0, 8))}...</code></td>
      <td><strong>${escapeHtml(tx.type)}</strong></td>
      <td><strong style="color: ${tx.type === 'Deposit' ? '#10B981' : '#F59E0B'};">₹${tx.amount}</strong></td>
      <td>${escapeHtml(tx.method || "UPI")}</td>
      <td>${escapeHtml(tx.account || "N/A")}</td>
      <td><code>${escapeHtml(tx.trxId || "N/A")}</code></td>
      <td>${escapeHtml(tx.date || "Today")}</td>
      <td>
        <span class="badge ${tx.status === 'Approved' || tx.status === 'Paid' ? 'badge-success' : (tx.status === 'Rejected' ? 'badge-danger' : 'badge-warning')}">
          ${escapeHtml(tx.status)}
        </span>
      </td>
      <td>
        ${tx.status === 'Pending' ? `
          <div style="display: flex; gap: 4px;">
            ${tx.type === 'Deposit' ? `
              <button class="btn btn-sm btn-success" onclick="approveDeposit('${tx.userId}', '${tx.txId}', ${tx.amount})">Approve</button>
              <button class="btn btn-sm btn-danger" onclick="rejectDeposit('${tx.userId}', '${tx.txId}')">Reject</button>
            ` : `
              <button class="btn btn-sm btn-success" onclick="approveWithdrawal('${tx.userId}', '${tx.txId}')">Mark Paid</button>
              <button class="btn btn-sm btn-danger" onclick="rejectWithdrawal('${tx.userId}', '${tx.txId}', ${tx.amount})">Reject & Refund</button>
            `}
          </div>
        ` : `<small style="color: #64748B;">Processed</small>`}
      </td>
    </tr>
  `).join("");
}

document.getElementById("finance-filter-pending")?.addEventListener("click", () => {
  pendingOnlyFilter = true;
  document.getElementById("finance-filter-pending").classList.add("active-filter");
  document.getElementById("finance-filter-all").classList.remove("active-filter");
  renderFinanceTable();
});

document.getElementById("finance-filter-all")?.addEventListener("click", () => {
  pendingOnlyFilter = false;
  document.getElementById("finance-filter-all").classList.add("active-filter");
  document.getElementById("finance-filter-pending").classList.remove("active-filter");
  renderFinanceTable();
});

window.approveDeposit = async (userId, txId, amount) => {
  if (!confirm(`Approve deposit of ₹${amount} for user? This will credit their Deposit Wallet balance.`)) return;
  try {
    // Check transaction is currently pending to prevent double crediting
    const txRef = ref(db, `transactions/${userId}/${txId}`);
    let alreadyProcessed = false;
    await runTransaction(txRef, (current) => {
      if (!current || current.status !== "Pending") {
        alreadyProcessed = true;
        return undefined; // abort
      }
      current.status = "Approved";
      return current;
    });

    if (alreadyProcessed) {
      alert("Error: Transaction is not in Pending status or has already been processed.");
      return;
    }

    // Atomically increment deposit balance
    const userDepositRef = ref(db, `users/${userId}/deposit`);
    await runTransaction(userDepositRef, (current) => (Number(current || 0) + Number(amount)));

    alert(`Deposit of ₹${amount} approved successfully!`);
  } catch (err) {
    alert("Failed to approve deposit: " + err.message);
  }
};

window.rejectDeposit = async (userId, txId) => {
  if (!confirm("Reject this deposit request?")) return;
  try {
    const txRef = ref(db, `transactions/${userId}/${txId}`);
    await update(txRef, { status: "Rejected" });
    alert("Deposit marked as Rejected.");
  } catch (err) {
    alert("Failed to reject deposit: " + err.message);
  }
};

window.approveWithdrawal = async (userId, txId) => {
  if (!confirm("Confirm payout has been transferred via UPI/Bank? This marks transaction as Paid.")) return;
  try {
    const txRef = ref(db, `transactions/${userId}/${txId}`);
    await update(txRef, { status: "Paid" });
    alert("Withdrawal marked as Paid!");
  } catch (err) {
    alert("Failed to update status: " + err.message);
  }
};

window.rejectWithdrawal = async (userId, txId, amount) => {
  if (!confirm(`Reject withdrawal and refund ₹${amount} back to user's Winning Balance?`)) return;
  try {
    const txRef = ref(db, `transactions/${userId}/${txId}`);
    let alreadyProcessed = false;
    await runTransaction(txRef, (current) => {
      if (!current || current.status !== "Pending") {
        alreadyProcessed = true;
        return undefined;
      }
      current.status = "Rejected";
      return current;
    });

    if (alreadyProcessed) {
      alert("Error: Transaction is not in Pending status.");
      return;
    }

    // Refund held amount back to user's winning balance
    const userWinningRef = ref(db, `users/${userId}/winning`);
    await runTransaction(userWinningRef, (current) => (Number(current || 0) + Number(amount)));

    alert(`Withdrawal rejected and ₹${amount} refunded to player wallet.`);
  } catch (err) {
    alert("Failed to reject withdrawal: " + err.message);
  }
};

// -------------------------------------------------------------
// Categories Management
// -------------------------------------------------------------
function renderCategories() {
  const grid = document.getElementById("categories-grid");
  if (allCategories.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #94A3B8;">No categories available.</div>`;
    return;
  }

  grid.innerHTML = allCategories.map(cat => `
    <div class="card" style="padding: 16px;">
      <div style="height: 120px; border-radius: 8px; overflow: hidden; margin-bottom: 12px; background: #000;">
        <img src="${escapeHtml(cat.img)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://via.placeholder.com/300x150?text=Category'">
      </div>
      <h4>${escapeHtml(cat.name)}</h4>
      <div style="margin-top: 12px;">
        <button class="btn btn-sm btn-danger btn-block" onclick="deleteCategory('${cat.key}')">Delete Category</button>
      </div>
    </div>
  `).join("");
}

addCategoryBtn?.addEventListener("click", () => {
  categoryForm.reset();
  categoryModal.style.display = "flex";
});

closeCatModalBtns.forEach(btn => btn.addEventListener("click", () => {
  categoryModal.style.display = "none";
}));

categoryForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("cat-name-input").value.trim();
  const img = document.getElementById("cat-img-input").value.trim();
  try {
    await push(ref(db, "categories"), { name, img });
    alert("Category created successfully!");
    categoryModal.style.display = "none";
  } catch (err) {
    alert("Error adding category: " + err.message);
  }
});

window.deleteCategory = async (key) => {
  if (!confirm("Delete this game category?")) return;
  try {
    await remove(ref(db, `categories/${key}`));
    alert("Category removed.");
  } catch (err) {
    alert("Error: " + err.message);
  }
};

// -------------------------------------------------------------
// Banners Management
// -------------------------------------------------------------
function renderBanners() {
  const grid = document.getElementById("banners-grid");
  if (allBanners.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #94A3B8;">No banners available.</div>`;
    return;
  }

  grid.innerHTML = allBanners.map(b => `
    <div class="card" style="padding: 16px;">
      <div style="height: 140px; border-radius: 8px; overflow: hidden; margin-bottom: 12px; background: #000;">
        <img src="${escapeHtml(b.img)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://via.placeholder.com/400x200?text=Banner'">
      </div>
      <h4>${escapeHtml(b.title || "Promotional Banner")}</h4>
      <small style="color: #94A3B8; word-break: break-all;">${escapeHtml(b.link || "No target URL")}</small>
      <div style="margin-top: 12px;">
        <button class="btn btn-sm btn-danger btn-block" onclick="deleteBanner('${b.key}')">Delete Banner</button>
      </div>
    </div>
  `).join("");
}

addBannerBtn?.addEventListener("click", () => {
  bannerForm.reset();
  bannerModal.style.display = "flex";
});

closeBannerModalBtns.forEach(btn => btn.addEventListener("click", () => {
  bannerModal.style.display = "none";
}));

bannerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("banner-title-input").value.trim();
  const img = document.getElementById("banner-img-input").value.trim();
  const link = document.getElementById("banner-link-input").value.trim();
  try {
    await push(ref(db, "banners"), { title, img, link });
    alert("Banner added successfully!");
    bannerModal.style.display = "none";
  } catch (err) {
    alert("Error: " + err.message);
  }
});

window.deleteBanner = async (key) => {
  if (!confirm("Delete this banner?")) return;
  try {
    await remove(ref(db, `banners/${key}`));
    alert("Banner removed.");
  } catch (err) {
    alert("Error: " + err.message);
  }
};

// -------------------------------------------------------------
// Match Results & Room Credentials
// (Credentials saved in /match_rooms/ for zero-leakage)
// -------------------------------------------------------------
function renderResultsTable() {
  const tbody = document.getElementById("results-tbody");
  if (allTournaments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">No matches available.</td></tr>`;
    return;
  }

  tbody.innerHTML = allTournaments.map(t => `
    <tr>
      <td><strong>${escapeHtml(t.title)}</strong></td>
      <td><span class="badge ${t.status === 'Completed' ? 'badge-success' : 'badge-primary'}">${escapeHtml(t.status || 'Active')}</span></td>
      <td><span class="badge badge-primary">Protected in /match_rooms</span></td>
      <td><span class="badge badge-primary">Hidden from public</span></td>
      <td><strong style="color: #F59E0B;">${escapeHtml(t.winnerName || 'None')}</strong></td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="openRoomModal('${t.key}')">Publish Room / Winner</button>
      </td>
    </tr>
  `).join("");
}

window.openRoomModal = (key) => {
  const t = allTournaments.find(item => item.key === key);
  if (!t) return;
  document.getElementById("room-tournament-id").value = key;
  document.getElementById("room-status-select").value = t.status || "Active";
  document.getElementById("room-winner-input").value = t.winnerName || "";

  // Load existing credentials from protected /match_rooms/
  onValue(ref(db, `match_rooms/${key}`), (snap) => {
    if (snap.exists()) {
      const room = snap.val();
      document.getElementById("room-id-input").value = room.roomId || "";
      document.getElementById("room-pass-input").value = room.roomPass || "";
    } else {
      document.getElementById("room-id-input").value = "";
      document.getElementById("room-pass-input").value = "";
    }
  }, { onlyOnce: true });

  roomModal.style.display = "flex";
};

closeRoomModalBtns.forEach(btn => btn.addEventListener("click", () => {
  roomModal.style.display = "none";
}));

roomPublishForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = document.getElementById("room-tournament-id").value;
  const room_id = document.getElementById("room-id-input").value.trim();
  const room_pass = document.getElementById("room-pass-input").value.trim();
  const status = document.getElementById("room-status-select").value;
  const winnerName = document.getElementById("room-winner-input").value.trim();

  try {
    // 1. Write credentials exclusively to protected /match_rooms/{key}
    await set(ref(db, `match_rooms/${key}`), {
      roomId: room_id || null,
      roomPass: room_pass || null,
      publishedAt: Date.now()
    });

    // 2. Update match status on public node
    await update(ref(db, `matches/${key}`), {
      status,
      winnerName: winnerName || null
    });

    alert("Room credentials published securely! Only joined participants can view them.");
    roomModal.style.display = "none";
  } catch (err) {
    alert("Error updating match: " + err.message);
  }
});

// -------------------------------------------------------------
// Leaderboard
// -------------------------------------------------------------
function renderLeaderboard() {
  const tbody = document.getElementById("leaderboard-tbody");
  const sorted = [...allUsers].sort((a, b) => {
    const totalA = Number(a.deposit || 0) + Number(a.winning || 0);
    const totalB = Number(b.deposit || 0) + Number(b.winning || 0);
    return totalB - totalA;
  }).slice(0, 50);

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center">No players registered.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((u, i) => `
    <tr>
      <td><strong>#${i + 1}</strong></td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="${u.photoUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + u.uid}" style="width: 24px; height: 24px; border-radius: 50%;">
          ${escapeHtml(u.username || "Gamer")}
        </div>
      </td>
      <td>${escapeHtml(u.email || "N/A")}</td>
      <td><strong>₹${Number(u.deposit || 0) + Number(u.winning || 0)}</strong></td>
      <td><span style="color: #F59E0B; font-weight: bold;">₹${u.winning || 0}</span></td>
    </tr>
  `).join("");
}

// -------------------------------------------------------------
// Wallet Points Adjustment
// -------------------------------------------------------------
function populateRewardUserSelect() {
  const select = document.getElementById("reward-user-select");
  if (!select) return;
  select.innerHTML = allUsers.map(u => `
    <option value="${u.uid}">${escapeHtml(u.username || 'User')} (${escapeHtml(u.email || u.uid)})</option>
  `).join("");
}

document.getElementById("points-adjustment-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const uid = document.getElementById("reward-user-select").value;
  const targetWallet = document.getElementById("reward-target-balance").value;
  const amount = Number(document.getElementById("reward-amount").value || 0);
  const description = document.getElementById("reward-description").value.trim();

  if (!uid || amount === 0) {
    alert("Please select a user and enter a non-zero amount.");
    return;
  }

  try {
    const walletRef = ref(db, `users/${uid}/${targetWallet}`);
    await runTransaction(walletRef, (current) => Math.max(0, Number(current || 0) + amount));

    // Audit transaction
    const dateStr = new Date().toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    await push(ref(db, `transactions/${uid}`), {
      account: "Admin Adjustment",
      amount: Math.abs(amount),
      date: dateStr,
      method: "Manual",
      status: "Approved",
      trxId: "ADJ-" + Date.now().toString().slice(-6),
      type: amount > 0 ? "Deposit" : "Withdraw"
    });

    alert(`Successfully adjusted ₹${amount} in ${targetWallet} wallet!`);
    document.getElementById("points-adjustment-form").reset();
  } catch (err) {
    alert("Failed to adjust wallet points: " + err.message);
  }
});

// -------------------------------------------------------------
// Notifications Broadcast
// -------------------------------------------------------------
document.getElementById("notification-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("notif-title").value.trim();
  const type = document.getElementById("notif-type").value;
  const message = document.getElementById("notif-message").value.trim();

  try {
    const dateStr = new Date().toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' });
    await push(ref(db, "notifications"), {
      title,
      type,
      message,
      date: dateStr,
      createdAt: Date.now()
    });
    alert("Notice successfully published to Android app users!");
    document.getElementById("notification-form").reset();
  } catch (err) {
    alert("Failed to publish notification: " + err.message);
  }
});

// -------------------------------------------------------------
// Support Tickets Desk
// -------------------------------------------------------------
function renderTickets() {
  const tbody = document.getElementById("tickets-tbody");
  if (allTickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">No support tickets found.</td></tr>`;
    return;
  }

  tbody.innerHTML = allTickets.map(t => `
    <tr>
      <td>${escapeHtml(t.username || t.userEmail || "Player")}</td>
      <td><strong>${escapeHtml(t.subject || "No Subject")}</strong></td>
      <td>${escapeHtml(t.message || "")}</td>
      <td><span class="badge ${t.status === 'resolved' ? 'badge-success' : 'badge-warning'}">${escapeHtml(t.status || 'open')}</span></td>
      <td>${t.reply ? `<small style="color: #10B981;">${escapeHtml(t.reply)}</small>` : '<em>No reply yet</em>'}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="openReplyModal('${t.key}', '${t.userId}')">Reply</button>
      </td>
    </tr>
  `).join("");
}

window.openReplyModal = (key, userId) => {
  const ticket = allTickets.find(t => t.key === key);
  if (!ticket) return;
  document.getElementById("reply-ticket-id").value = key;
  document.getElementById("reply-ticket-subject").textContent = ticket.subject || "Support Inquiry";
  document.getElementById("reply-ticket-message").textContent = ticket.message || "";
  document.getElementById("reply-text").value = ticket.reply || "";
  document.getElementById("reply-status").value = ticket.status || "resolved";
  replyModal.setAttribute("data-user-id", userId || ticket.userId);
  replyModal.style.display = "flex";
};

closeReplyModalBtns.forEach(btn => btn.addEventListener("click", () => {
  replyModal.style.display = "none";
}));

ticketReplyForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = document.getElementById("reply-ticket-id").value;
  const userId = replyModal.getAttribute("data-user-id");
  const reply = document.getElementById("reply-text").value.trim();
  const status = document.getElementById("reply-status").value;

  try {
    await update(ref(db, `support_tickets/${key}`), { reply, status });
    if (userId) {
      await update(ref(db, `user_tickets/${userId}/${key}`), { reply, status }).catch(() => {});
    }
    alert("Support reply sent to player!");
    replyModal.style.display = "none";
  } catch (err) {
    alert("Failed to reply to ticket: " + err.message);
  }
});

// -------------------------------------------------------------
// User App Code Editor & Platform Settings
// -------------------------------------------------------------
saveAppcodeBtn?.addEventListener("click", async () => {
  const content = appcodeTextarea.value.trim();
  try {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = content;
    }
    await set(ref(db, "app_code"), parsed);
    alert("User App Code & Config saved successfully to /app_code!");
  } catch (err) {
    alert("Failed to save app code: " + err.message);
  }
});

settingsForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const appName = document.getElementById("setting-appname").value.trim();
  const appVersion = document.getElementById("setting-appversion").value.trim();
  const whatsapp = document.getElementById("setting-whatsapp").value.trim();
  const telegram = document.getElementById("setting-telegram").value.trim();
  const notice = document.getElementById("setting-notice").value.trim();

  try {
    await set(ref(db, "app_settings"), {
      appName, appVersion, whatsapp, telegram, notice
    });
    alert("Platform configuration saved to /app_settings!");
  } catch (err) {
    alert("Failed to save settings: " + err.message);
  }
});

function escapeHtml(text) {
  if (!text) return "";
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
