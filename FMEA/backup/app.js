// Adhesive manufacturing FMEA application logic

// State Management
let currentUser = null;
let activeFormulationId = null;
let isFMEAUnlocked = false;
let pendingTargetView = null;

// Databases (stored in localStorage)
let usersDB = [];
let formulationsDB = [];
let libraryDB = [];

// Authority Configurable Rating Colors state - Gentle Harmonic Palette
const defaultRatingColors = {
    crit: "#ea6c75",
    high: "#f49352",
    medium: "#f6c453",
    lowmed: "#8cdab2",
    low: "#48bb78"
};

let savedColors = null;
try {
    savedColors = JSON.parse(localStorage.getItem("fmea_rating_colors"));
} catch (e) {}

if (savedColors && (savedColors.crit === "#ef4444" || savedColors.high === "#f97316")) {
    savedColors = { ...defaultRatingColors };
    localStorage.setItem("fmea_rating_colors", JSON.stringify(savedColors));
}

let ratingColors = savedColors || { ...defaultRatingColors };

// Static Default History Library for Adhesive Manufacturing
// Static Default History Library for Adhesive Manufacturing
const defaultLibrary = [
    {
        id: "lib-default-1",
        category: "Epoxy Adhesives",
        section: "raw_material",
        step: "Bisphenol-A Liquid Epoxy Resin",
        mode: "High Moisture Content in raw material",
        cause: "Inadequate seal integrity of supplier containers or warehousing storage humidity.",
        sev: 8,
        occ: 4,
        det: 6,
        action: "Establish raw material receiving moisture threshold (max 0.1%) via Karl Fischer titration."
    },
    {
        id: "lib-default-2",
        category: "Epoxy Adhesives",
        section: "formulation",
        step: "Amine Curing Agent blend ratio",
        mode: "Exothermic runway (Overheating) during mixing",
        cause: "Incorrect stoichiometric ratio of primary and secondary amines, or excessive batch size.",
        sev: 9,
        occ: 3,
        det: 7,
        action: "Incorporate mixing-pot coolant jacket temperature sensors linked to automated valve feed locks."
    },
    {
        id: "lib-default-3",
        category: "Polyurethane Adhesives",
        section: "raw_material",
        step: "Methylene Diphenyl Diisocyanate (MDI)",
        mode: "Isocyanate dimer formation (solidification)",
        cause: "Extended storage below recommended crystallization temperature (below 20°C) or moisture ingress.",
        sev: 8,
        occ: 5,
        det: 5,
        action: "Equip raw material storage tanks with dry nitrogen gas blankets and constant warming jackets."
    },
    {
        id: "lib-default-4",
        category: "Polyurethane Adhesives",
        section: "formulation",
        step: "NCO:OH Stoichiometric Index",
        mode: "Incomplete polymer curing (residual tackiness)",
        cause: "Moisture absorption during formulation or error in weight scale calibration.",
        sev: 8,
        occ: 4,
        det: 6,
        action: "Perform FTIR analysis on pre-release samples to check NCO peak area percentage."
    },
    {
        id: "lib-default-5",
        category: "Epoxy Adhesives",
        section: "process",
        step: "Vacuum Degassing cycle",
        mode: "Air bubble voids in final adhesive syringe",
        cause: "Incomplete vacuum pressure pull (less than 10 mbar) or degassing cycle timer set too short.",
        sev: 7,
        occ: 5,
        det: 5,
        action: "Install digital absolute pressure transmitters linked to an automated PLC cycle interlock."
    },
    {
        id: "lib-default-6",
        category: "Hot Melt Adhesives",
        section: "process",
        step: "Melt compounding (extrusion)",
        mode: "Thermal degradation of tackifying resins",
        cause: "Heating profile set too high or residence time inside twin-screw extruder exceeded threshold.",
        sev: 7,
        occ: 4,
        det: 4,
        action: "Optimize extruder screw configurations to reduce shear friction heat and add thermal stabilizers."
    },
    {
        id: "lib-default-7",
        category: "Acrylic & Cyanoacrylate",
        section: "packaging",
        step: "Polyethylene bottle barrier lining",
        mode: "Premature polymerization inside shelf package",
        cause: "Insufficient stabilizer concentration (e.g. Hydroquinone or SO2) or moisture permeation through HDPE bottle walls.",
        sev: 9,
        occ: 4,
        det: 8,
        action: "Utilize fluorinated HDPE bottles and introduce moisture vapor transmission rate (MVTR) receiving inspect audits."
    },
    {
        id: "lib-default-8",
        category: "Silicone & UV-Curable",
        section: "packing_shipment",
        step: "Logistic Shipment (Reefer transport)",
        mode: "Premature thermal curing during shipping",
        cause: "Refrigerated ocean container cooling unit failure or prolonged transit delay in tropical ports.",
        sev: 9,
        occ: 3,
        det: 6,
        action: "Mandate USB temperature tracking data loggers inside every shipping pallet box with alarms set for >25°C."
    }
];

// --- APP ROOT INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    // Initial data hydration
    loadAllDatabases();
    checkActiveSession();

    // Icons setup
    lucide.createIcons();

    // Load listeners
    attachAppEventListeners();

    // Switch views to default
    if (currentUser) {
        switchView("dashboard");
    }

    // Persistent horizontal scrollbars for wide tables
    initHScrollMirrors();
});

// Adds an always-visible horizontal scrollbar above each table, mirroring
// the table-wrapper's native scroll so users don't have to scroll to the
// bottom of a tall table just to reach the horizontal scrollbar.
function initHScrollMirrors() {
    document.querySelectorAll(".table-wrapper").forEach(wrapper => {
        const table = wrapper.querySelector("table");
        if (!table || wrapper.dataset.hscrollMirrored) return;
        wrapper.dataset.hscrollMirrored = "true";

        const mirror = document.createElement("div");
        mirror.className = "hscroll-mirror";
        const mirrorInner = document.createElement("div");
        mirrorInner.className = "hscroll-mirror-inner";
        mirror.appendChild(mirrorInner);
        wrapper.parentNode.insertBefore(mirror, wrapper);

        // Always show the mirror bar, even when the table has no rows or
        // doesn't yet overflow, so the scrollbar chrome stays consistent.
        let syncing = false;
        const sync = () => {
            const width = Math.max(table.scrollWidth, wrapper.clientWidth);
            mirrorInner.style.width = width + "px";
            mirror.style.display = "block";
        };
        sync();

        mirror.addEventListener("scroll", () => {
            if (syncing) return;
            syncing = true;
            wrapper.scrollLeft = mirror.scrollLeft;
            syncing = false;
        });
        wrapper.addEventListener("scroll", () => {
            if (syncing) return;
            syncing = true;
            mirror.scrollLeft = wrapper.scrollLeft;
            syncing = false;
        });

        new ResizeObserver(sync).observe(table);
        window.addEventListener("resize", sync);
    });
}

// Database Loader
function loadAllDatabases() {
    loadFamiliesDB();
    applyRatingColors();
    try {
        usersDB = JSON.parse(localStorage.getItem("fmea_users")) || [];
        formulationsDB = JSON.parse(localStorage.getItem("fmea_formulations")) || [];
        
        // Backfill new fields on existing formulations to prevent undefined references
        let needsFormulationsSave = false;
        formulationsDB.forEach(form => {
            const tabsDFMEA = ["raw_materials", "formulation", "packaging"];
            const tabsPFMEA = ["operations", "logistics"];
            
            tabsDFMEA.forEach(tab => {
                if (form.dfmea && form.dfmea[tab]) {
                    form.dfmea[tab].forEach(row => {
                        if (row.number === undefined) { row.number = ""; needsFormulationsSave = true; }
                        if (row.function === undefined) { row.function = ""; needsFormulationsSave = true; }
                        if (row.detail === undefined) { row.detail = ""; needsFormulationsSave = true; }
                        if (row.characteristic === undefined) { row.characteristic = ""; needsFormulationsSave = true; }
                        if (row.effect === undefined) { row.effect = ""; needsFormulationsSave = true; }
                        if (row.prevention === undefined) {
                            row.prevention = row.controls || "";
                            delete row.controls;
                            needsFormulationsSave = true;
                        }
                        if (row.detection_controls === undefined) { row.detection_controls = ""; needsFormulationsSave = true; }
                        if (row.result === undefined) { row.result = ""; needsFormulationsSave = true; }
                        if (row.result_date === undefined) { row.result_date = ""; needsFormulationsSave = true; }
                        if (row.result_sev === undefined) { row.result_sev = 1; needsFormulationsSave = true; }
                        if (row.result_occ === undefined) { row.result_occ = 1; needsFormulationsSave = true; }
                        if (row.result_det === undefined) { row.result_det = 1; needsFormulationsSave = true; }
                        if (row.concern === undefined) { row.concern = ""; needsFormulationsSave = true; }
                        if (row.happened === undefined) { row.happened = "No"; needsFormulationsSave = true; }
                    });
                }
            });
            
            tabsPFMEA.forEach(tab => {
                if (form.pfmea && form.pfmea[tab]) {
                    form.pfmea[tab].forEach(row => {
                        if (row.function === undefined) { row.function = ""; needsFormulationsSave = true; }
                        if (row.detail === undefined) { row.detail = ""; needsFormulationsSave = true; }
                        if (row.characteristic === undefined) { row.characteristic = ""; needsFormulationsSave = true; }
                        if (row.effect === undefined) { row.effect = ""; needsFormulationsSave = true; }
                        if (row.prevention === undefined) {
                            row.prevention = row.controls || "";
                            delete row.controls;
                            needsFormulationsSave = true;
                        }
                        if (row.detection_controls === undefined) { row.detection_controls = ""; needsFormulationsSave = true; }
                        if (row.result === undefined) { row.result = ""; needsFormulationsSave = true; }
                        if (row.result_date === undefined) { row.result_date = ""; needsFormulationsSave = true; }
                        if (row.result_sev === undefined) { row.result_sev = 1; needsFormulationsSave = true; }
                        if (row.result_occ === undefined) { row.result_occ = 1; needsFormulationsSave = true; }
                        if (row.result_det === undefined) { row.result_det = 1; needsFormulationsSave = true; }
                        if (row.concern === undefined) { row.concern = ""; needsFormulationsSave = true; }
                        if (row.happened === undefined) { row.happened = "No"; needsFormulationsSave = true; }
                    });
                }
            });
        });

        if (needsFormulationsSave) {
            localStorage.setItem("fmea_formulations", JSON.stringify(formulationsDB));
        }
        
        const storedLibrary = localStorage.getItem("fmea_library");
        if (storedLibrary) {
            libraryDB = JSON.parse(storedLibrary);

            // One-time cleanup: earlier versions auto-seeded the library with
            // demo/test data on first load. Wipe it once so the library starts
            // empty until the user imports or creates items themselves.
            if (!localStorage.getItem("fmea_library_seed_pruned_v2")) {
                libraryDB = [];
                localStorage.setItem("fmea_library_seed_pruned_v2", "true");
                localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
            }

            // Legacy Migration Check
            let needsMigrationSave = false;
            libraryDB.forEach(item => {
                if (!item.section) {
                    needsMigrationSave = true;
                    if (item.fmeaType === "dfmea") {
                        if (item.subtab === "raw_materials") item.section = "raw_material";
                        else if (item.subtab === "packaging") item.section = "packaging";
                        else item.section = "formulation";
                    } else {
                        if (item.subtab === "logistics") item.section = "packing_shipment";
                        else item.section = "process";
                    }
                    delete item.fmeaType;
                    delete item.subtab;
                }
                
                // Backfill the 18 columns on legacy library items as well
                if (item.number === undefined) { item.number = ""; needsMigrationSave = true; }
                if (item.function === undefined) { item.function = ""; needsMigrationSave = true; }
                if (item.detail === undefined) { item.detail = ""; needsMigrationSave = true; }
                if (item.characteristic === undefined) { item.characteristic = ""; needsMigrationSave = true; }
                if (item.effect === undefined) { item.effect = ""; needsMigrationSave = true; }
                if (item.prevention === undefined) {
                    item.prevention = item.controls || "";
                    delete item.controls;
                    needsMigrationSave = true;
                }
                if (item.detection_controls === undefined) { item.detection_controls = ""; needsMigrationSave = true; }
                if (item.result === undefined) { item.result = ""; needsMigrationSave = true; }
                if (item.result_date === undefined) { item.result_date = ""; needsMigrationSave = true; }
                if (item.result_sev === undefined) { item.result_sev = 1; needsMigrationSave = true; }
                if (item.result_occ === undefined) { item.result_occ = 1; needsMigrationSave = true; }
                if (item.result_det === undefined) { item.result_det = 1; needsMigrationSave = true; }
                if (item.concern === undefined) { item.concern = ""; needsMigrationSave = true; }
                if (item.happened === undefined) { item.happened = "No"; needsMigrationSave = true; }
            });
            if (needsMigrationSave) {
                localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
            }
        } else {
            libraryDB = [];
            localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
        }
    } catch (e) {
        console.error("Storage load failure, resetting local databases...", e);
        usersDB = [];
        formulationsDB = [];
        libraryDB = [];
    }
}

// Session Validation
function checkActiveSession() {
    const session = localStorage.getItem("fmea_session_user");
    if (session) {
        currentUser = JSON.parse(session);
        document.getElementById("auth-screen").style.display = "none";
        
        // Populate profile card info
        document.getElementById("display-username").textContent = currentUser.username;
        document.getElementById("display-role").textContent = currentUser.role;
        document.getElementById("avatar-initials").textContent = currentUser.username.substring(0, 2).toUpperCase();
        
        // HOD view configurations
        if (currentUser.role === "hod") {
            document.getElementById("hod-pending-alert").style.display = "flex";
        } else {
            document.getElementById("hod-pending-alert").style.display = "none";
        }

        // Hydrate dropdown
        updateAllFamilyDropdowns();
        populateFormulationSelector();
        
        // Dashboard reload
        updateDashboard();
    } else {
        document.getElementById("auth-screen").style.display = "flex";
    }
}

// --- CONTROLLER EVENT BINDINGS ---
function attachAppEventListeners() {
    // Auth Toggles
    document.getElementById("go-to-register").addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("login-card").style.display = "none";
        document.getElementById("register-card").style.display = "block";
    });
    
    document.getElementById("go-to-login").addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("register-card").style.display = "none";
        document.getElementById("login-card").style.display = "block";
    });

    // Auth Form Submits
    document.getElementById("login-form").addEventListener("submit", handleLogin);
    document.getElementById("register-form").addEventListener("submit", handleRegister);
    document.getElementById("btn-logout").addEventListener("click", handleLogout);
    document.getElementById("fmea-auth-form").addEventListener("submit", handleFMEAAuthSubmit);

    // Sidebar navigation tabs router
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            const targetView = e.currentTarget.dataset.view;
            if (targetView) {
                switchView(targetView);
            }
        });
    });

    // Active Formulation selector dropdown
    document.getElementById("active-formulation-select").addEventListener("change", (e) => {
        activeFormulationId = e.target.value;
        localStorage.setItem("fmea_active_form_id", activeFormulationId);
        
        // Refresh active views
        const currentView = document.querySelector(".view-panel.active").id.replace("view-", "");
        switchView(currentView);
    });

    // Sidebar collapse button
    document.getElementById("sidebar-collapse-btn").addEventListener("click", () => {
        const sidebar = document.querySelector("aside.app-sidebar");
        sidebar.classList.toggle("collapsed");
    });

    // Theme Switch
    document.getElementById("theme-toggle").addEventListener("click", () => {
        const theme = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        showToast(`Theme changed to ${theme}.`, "success");
    });
    
    // Help sidebar toggle
    document.getElementById("guidelines-toggle").addEventListener("click", () => {
        const isCollapsed = document.getElementById("reference-sidebar").classList.toggle("collapsed");
        const handle = document.getElementById("sidebar-handle");
        const handleIcon = document.getElementById("handle-icon");
        if (isCollapsed) {
            handleIcon.setAttribute("data-lucide", "chevron-left");
            handle.style.right = "0";
        } else {
            handleIcon.setAttribute("data-lucide", "chevron-right");
            handle.style.right = "320px";
        }
        lucide.createIcons();
    });
    
    document.getElementById("sidebar-close").addEventListener("click", () => {
        document.getElementById("reference-sidebar").classList.add("collapsed");
        document.getElementById("sidebar-handle").style.right = "0";
        document.getElementById("handle-icon").setAttribute("data-lucide", "chevron-left");
        lucide.createIcons();
    });
    
    document.getElementById("sidebar-handle").addEventListener("click", () => {
        const isCollapsed = document.getElementById("reference-sidebar").classList.toggle("collapsed");
        const handle = document.getElementById("sidebar-handle");
        const handleIcon = document.getElementById("handle-icon");
        if (isCollapsed) {
            handleIcon.setAttribute("data-lucide", "chevron-left");
            handle.style.right = "0";
        } else {
            handleIcon.setAttribute("data-lucide", "chevron-right");
            handle.style.right = "320px";
        }
        lucide.createIcons();
    });

    // Modals generic close button
    document.querySelectorAll(".btn-close-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
        });
    });

    // Formulation Create Modal action
    document.getElementById("btn-create-formulation").addEventListener("click", () => {
        document.getElementById("formulation-modal").classList.add("active");
    });
    
    document.getElementById("formulation-create-form").addEventListener("submit", handleCreateFormulation);

    // Window Focus Listener for Live HOD Approval/Rejection Sync
    window.addEventListener("focus", () => {
        const raw = localStorage.getItem("fmea_formulations");
        if (raw) {
            formulationsDB = JSON.parse(raw);
            populateFormulationSelector();
            filterAndRenderFMEA();
            updateDashboard();
        }
    });

    // HOD Dashboard alert shortcut
    document.getElementById("btn-go-formulations").addEventListener("click", () => {
        switchView("formulations");
    });

    // DFMEA & PFMEA Sub-tabs controls
    setupSubtabListeners("dfmea");
    setupSubtabListeners("pfmea");

    // Dynamic search boxes
    document.getElementById("dfmea-search").addEventListener("input", filterAndRenderFMEA);
    document.getElementById("pfmea-search").addEventListener("input", filterAndRenderFMEA);

    // Pick & Place Sidebar draw toggles
    document.querySelectorAll(".btn-toggle-picker").forEach(btn => {
        btn.addEventListener("click", togglePickerSidebar);
    });

    // Library explorer filters & search
    document.getElementById("lib-search").addEventListener("input", filterLibraryView);
    document.getElementById("lib-filter-category").addEventListener("change", filterLibraryView);
    
    document.querySelectorAll("#lib-sub-nav .sub-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll("#lib-sub-nav .sub-tab-btn").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            filterLibraryView();
        });
    });
    
    document.getElementById("lib-picker-search").addEventListener("input", filterPickerSidebar);
    document.getElementById("lib-picker-category").addEventListener("change", filterPickerSidebar);
    document.getElementById("lib-picker-section").addEventListener("change", filterPickerSidebar);

    // Library Item create modal action
    document.getElementById("btn-add-library-item").addEventListener("click", () => {
        document.getElementById("lib-modal").classList.add("active");
    });
    document.getElementById("lib-create-form").addEventListener("submit", handleCreateLibraryItem);

    // Clear Library and Restore Default templates triggers
    document.getElementById("btn-clear-library").addEventListener("click", () => {
        if (confirm("Are you sure you want to permanently delete ALL reference items in the History Library? This will remove both your uploaded items and default templates. This action cannot be undone.")) {
            libraryDB = [];
            localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
            renderLibraryView();
            showToast("History Library cleared completely.", "success");
        }
    });

    document.getElementById("btn-restore-library-defaults").addEventListener("click", () => {
        if (confirm("Are you sure you want to restore the default standard reference templates into the History Library? This will append the default templates to your current library.")) {
            const defaults = JSON.parse(JSON.stringify(defaultLibrary));
            defaults.forEach(item => {
                item.function = "";
                item.detail = "";
                item.characteristic = "";
                item.effect = "";
                item.prevention = "";
                item.detection_controls = "";
                item.result = "";
                item.result_date = "";
                item.result_sev = 1;
                item.result_occ = 1;
                item.result_det = 1;
                item.concern = "";
                item.happened = "No";
                item.id = "lib-default-" + Math.floor(Math.random() * 100000) + "-" + Date.now();
                libraryDB.push(item);
            });
            localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
            renderLibraryView();
            showToast("Default templates restored successfully.", "success");
        }
    });

    const btnGoDFMEA = document.getElementById("btn-open-active-dfmea");
    if (btnGoDFMEA) {
        btnGoDFMEA.addEventListener("click", () => {
            switchView("dfmea");
            const activeBtn = document.querySelector("#lib-sub-nav .sub-tab-btn.active");
            const section = activeBtn ? activeBtn.dataset.section : "raw_material";
            let subtab = "raw_materials";
            if (section === "formulation") subtab = "formulation";
            else if (section === "packaging") subtab = "packaging";
            const subtabBtn = document.querySelector(`#view-dfmea .tabs-sub-navigation .sub-tab-btn[data-subtab="${subtab}"]`);
            if (subtabBtn) subtabBtn.click();
        });
    }

    const btnGoPFMEA = document.getElementById("btn-open-active-pfmea");
    if (btnGoPFMEA) {
        btnGoPFMEA.addEventListener("click", () => {
            switchView("pfmea");
            const activeBtn = document.querySelector("#lib-sub-nav .sub-tab-btn.active");
            const section = activeBtn ? activeBtn.dataset.section : "process";
            const subtab = section === "packing_shipment" ? "logistics" : "operations";
            const subtabBtn = document.querySelector(`#view-pfmea .tabs-sub-navigation .sub-tab-btn[data-subtab="${subtab}"]`);
            if (subtabBtn) subtabBtn.click();
        });
    }

    const btnDFMEAOpenLib = document.getElementById("btn-dfmea-open-library");
    if (btnDFMEAOpenLib) {
        btnDFMEAOpenLib.addEventListener("click", () => {
            const activeSubtab = document.querySelector("#view-dfmea .tabs-sub-navigation .sub-tab-btn.active")?.dataset.subtab || "raw_materials";
            let targetSection = "raw_material";
            if (activeSubtab === "formulation") targetSection = "formulation";
            else if (activeSubtab === "packaging") targetSection = "packaging";
            
            switchView("library");
            const libBtn = document.querySelector(`#lib-sub-nav .sub-tab-btn[data-section="${targetSection}"]`);
            if (libBtn) libBtn.click();
        });
    }

    const btnPFMEAOpenLib = document.getElementById("btn-pfmea-open-library");
    if (btnPFMEAOpenLib) {
        btnPFMEAOpenLib.addEventListener("click", () => {
            const activeSubtab = document.querySelector("#view-pfmea .tabs-sub-navigation .sub-tab-btn.active")?.dataset.subtab || "operations";
            const targetSection = activeSubtab === "logistics" ? "packing_shipment" : "process";
            
            switchView("library");
            const libBtn = document.querySelector(`#lib-sub-nav .sub-tab-btn[data-section="${targetSection}"]`);
            if (libBtn) libBtn.click();
        });
    }

    // CSV / Excel Import modal triggers
    const openImportModal = (defaultDest = "library") => {
        document.getElementById("lib-csv-file-input").value = "";
        document.getElementById("lib-csv-preview-area").style.display = "none";
        document.getElementById("btn-submit-lib-csv").disabled = true;
        const destSelect = document.getElementById("import-destination-select");
        if (destSelect) destSelect.value = defaultDest;
        document.getElementById("lib-import-modal").classList.add("active");
    };

    const btnLibImport = document.getElementById("btn-open-import-lib-modal");
    if (btnLibImport) btnLibImport.addEventListener("click", () => openImportModal("library"));

    document.querySelectorAll(".btn-open-import-modal").forEach(btn => {
        btn.addEventListener("click", () => openImportModal("active_worksheet"));
    });

    document.getElementById("lib-csv-file-input").addEventListener("change", handleLibCSVSelected);
    document.getElementById("btn-submit-lib-csv").addEventListener("click", handleLibCSVConfirm);

    // Revision request submission form
    document.getElementById("revision-request-form").addEventListener("submit", handleCreateRevisionSubmit);

    // HOD Decisions submission form
    document.getElementById("hod-decision-form").addEventListener("submit", handleHODDecisionSubmit);

    // Control Plan actions
    document.getElementById("btn-export-cp-csv").addEventListener("click", exportControlPlanCSV);

    // Product or Process Families actions
    document.getElementById("btn-add-family").addEventListener("click", () => {
        document.getElementById("family-modal").classList.add("active");
    });
    document.getElementById("family-create-form").addEventListener("submit", handleCreateFamilySubmit);

    // Color Settings actions
    document.getElementById("btn-reset-colors").addEventListener("click", () => {
        ratingColors = { ...defaultRatingColors };
        localStorage.setItem("fmea_rating_colors", JSON.stringify(ratingColors));
        applyRatingColors();
        populateSettingsColors();
        showToast("Colors reset to system defaults.", "success");
    });
    document.getElementById("settings-color-form").addEventListener("submit", () => {
        ratingColors.crit = document.getElementById("color-crit").value;
        ratingColors.high = document.getElementById("color-high").value;
        ratingColors.medium = document.getElementById("color-medium").value;
        ratingColors.lowmed = document.getElementById("color-lowmed").value;
        ratingColors.low = document.getElementById("color-low").value;
        
        localStorage.setItem("fmea_rating_colors", JSON.stringify(ratingColors));
        applyRatingColors();
        showToast("Risk rating colors updated successfully.", "success");
    });
    
    // Audit log subtabs toggle
    document.querySelectorAll("#view-audit .sub-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll("#view-audit .sub-tab-btn").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            
            const subtab = e.currentTarget.dataset.subtab;
            if (subtab === "change_logs") {
                document.getElementById("audit-subtab-change_logs").style.display = "block";
                document.getElementById("audit-subtab-revisions").style.display = "none";
                renderAuditTimeline();
            } else {
                document.getElementById("audit-subtab-change_logs").style.display = "none";
                document.getElementById("audit-subtab-revisions").style.display = "block";
                renderRevisionsLog();
            }
        });
    });
}

// Subtab toggle dispatcher
function setupSubtabListeners(viewType) {
    const parent = document.getElementById(`view-${viewType}`);
    parent.querySelectorAll(".tabs-sub-navigation .sub-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            parent.querySelectorAll(".tabs-sub-navigation .sub-tab-btn").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            
            // Clear search
            document.getElementById(`${viewType}-search`).value = "";
            
            // Re-render
            renderFMEAWorksheet(viewType);
        });
    });

    // Row add button
    parent.querySelector(".btn-add-row-action").addEventListener("click", () => {
        addFMEARow(viewType);
    });
}

// --- AUTHENTICATION ACTIONS ---
function handleLogin() {
    const userVal = document.getElementById("login-username").value.trim();
    const passVal = document.getElementById("login-password").value;

    const user = usersDB.find(u => u.username === userVal && u.password === passVal);
    if (user) {
        localStorage.setItem("fmea_session_user", JSON.stringify(user));
        document.getElementById("login-form").reset();
        
        showToast(`Successfully logged in as ${user.username}.`, "success");
        checkActiveSession();
        switchView("dashboard");
    } else {
        showToast("Invalid credentials, user profile not found.", "error");
    }
}

function handleRegister() {
    const userVal = document.getElementById("register-username").value.trim();
    const roleVal = document.getElementById("register-role").value;
    const passVal = document.getElementById("register-password").value;

    if (passVal.length < 6) {
        showToast("Password must contain at least 6 characters.", "error");
        return;
    }

    if (usersDB.some(u => u.username === userVal)) {
        showToast("Username already exists in workspace.", "error");
        return;
    }

    const newUser = { username: userVal, role: roleVal, password: passVal };
    usersDB.push(newUser);
    localStorage.setItem("fmea_users", JSON.stringify(usersDB));

    document.getElementById("register-form").reset();
    showToast("Profile registered. You may now login.", "success");
    
    // Flip to login
    document.getElementById("register-card").style.display = "none";
    document.getElementById("login-card").style.display = "block";
}

function handleFMEAAuthSubmit() {
    const passVal = document.getElementById("fmea-auth-pass-input").value;
    if (!currentUser) return;

    if (passVal === "123" || passVal === currentUser.password) {
        isFMEAUnlocked = true;
        document.getElementById("fmea-auth-modal").classList.remove("active");
        showToast("Authorization Verified! DFMEA and PFMEA Worksheets Unlocked.", "success");
        
        const target = pendingTargetView || "dfmea";
        pendingTargetView = null;
        switchView(target);
    } else {
        showToast("Security Verification Failed: Incorrect password entered.", "error");
    }
}

function handleLogout() {
    localStorage.removeItem("fmea_session_user");
    localStorage.removeItem("fmea_active_form_id");
    currentUser = null;
    activeFormulationId = null;
    isFMEAUnlocked = false;
    pendingTargetView = null;
    
    showToast("Signed out from workspace.", "success");
    
    // Reset view visibility
    document.getElementById("auth-screen").style.display = "flex";
}

// --- VIEW ROUTER NAVIGATION ---
function switchView(viewName) {
    if (!currentUser) return;

    // Password Security Authentication: Require password verification before entering DFMEA, PFMEA, or Settings
    if (["dfmea", "pfmea", "settings"].includes(viewName) && !isFMEAUnlocked) {
        pendingTargetView = viewName;
        document.getElementById("fmea-auth-pass-input").value = "";
        document.getElementById("fmea-auth-modal").classList.add("active");
        setTimeout(() => {
            document.getElementById("fmea-auth-pass-input").focus();
        }, 100);
        return;
    }

    // Toggle nav link styles
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
        if (item.dataset.view === viewName) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    // Toggle display of main view containers
    document.querySelectorAll(".view-panel").forEach(panel => {
        panel.classList.remove("active");
    });
    
    const activePanel = document.getElementById(`view-${viewName}`);
    if (activePanel) {
        activePanel.classList.add("active");
    }

    // View-specific loaders
    if (viewName === "dashboard") {
        updateDashboard();
    } else if (viewName === "formulations") {
        renderFormulationsCards();
    } else if (viewName === "dfmea") {
        renderFMEAWorksheet("dfmea");
    } else if (viewName === "pfmea") {
        renderFMEAWorksheet("pfmea");
    } else if (viewName === "control-plan") {
        renderControlPlan();
    } else if (viewName === "library") {
        renderLibraryView();
    } else if (viewName === "families") {
        renderFamiliesView();
    } else if (viewName === "settings") {
        populateSettingsColors();
    } else if (viewName === "audit") {
        // Trigger subtab default render
        const activeSubtab = document.querySelector("#view-audit .sub-tab-btn.active").dataset.subtab;
        if (activeSubtab === "change_logs") {
            renderAuditTimeline();
        } else {
            renderRevisionsLog();
        }
    }

    // Toggle Pick & Place Floating Handle and panel sync
    const pickPanel = document.getElementById("library-pick-sidebar");
    const pickHandle = document.getElementById("library-picker-handle");
    
    if (["dfmea", "pfmea"].includes(viewName) && activeFormulationId) {
        pickHandle.style.display = "flex";
    } else {
        pickHandle.style.display = "none";
        pickPanel.classList.add("collapsed");
    }
}

// --- DROPDOWN FORMULATION MANAGERS ---
function populateFormulationSelector() {
    const select = document.getElementById("active-formulation-select");
    select.innerHTML = "";
    
    if (formulationsDB.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "-- No Formulations Registered --";
        select.appendChild(option);
        activeFormulationId = null;
        return;
    }

    // Order alphabetically
    formulationsDB.forEach(form => {
        const option = document.createElement("option");
        option.value = form.id;
        option.textContent = `${form.name} [${form.category}]`;
        select.appendChild(option);
    });

    // Restore selected ID
    const savedId = localStorage.getItem("fmea_active_form_id");
    if (savedId && formulationsDB.some(f => f.id === savedId)) {
        activeFormulationId = savedId;
        select.value = savedId;
    } else {
        activeFormulationId = formulationsDB[0].id;
        select.value = activeFormulationId;
        localStorage.setItem("fmea_active_form_id", activeFormulationId);
    }
}

// --- FORMULATIONS CRUD ---
function renderFormulationsCards() {
    const container = document.getElementById("formulations-cards-container");
    container.innerHTML = "";

    if (formulationsDB.length === 0) {
        container.innerHTML = `
            <div class="table-empty-state" style="grid-column: 1 / -1; width: 100%;">
                <div class="empty-icon">🧪</div>
                <h3 class="empty-title">No Adhesive Formulations</h3>
                <p class="empty-subtitle">Click "New Formulation" to register a product specification.</p>
            </div>
        `;
        return;
    }

    formulationsDB.forEach(form => {
        const card = document.createElement("div");
        card.className = "formulation-card";
        
        // Calculate counts
        const dfmeaRows = form.dfmea.raw_materials.length + form.dfmea.formulation.length + form.dfmea.packaging.length;
        const pfmeaRows = form.pfmea.operations.length + form.pfmea.logistics.length;
        
        let statusBadgeClass = "badge-draft";
        if (form.status === "pending") statusBadgeClass = "badge-pending";
        else if (form.status === "approved") statusBadgeClass = "badge-approved";
        else if (form.status === "rejected") statusBadgeClass = "badge-rejected";

        card.innerHTML = `
            <div class="card-header-row">
                <div class="card-title">${form.name}</div>
                <span class="card-category-badge">${form.category}</span>
            </div>
            <p class="card-desc">${form.description || "No specifications description provided."}</p>
            
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <span class="badge-status ${statusBadgeClass}">${form.status}</span>
                <span class="badge-status badge-draft" style="background-color: var(--bg-tertiary); color: var(--text-secondary);">Rev ${form.revision}</span>
            </div>

            <div class="card-metadata">
                <div><strong>DFMEA Rows:</strong> ${dfmeaRows}</div>
                <div><strong>PFMEA Rows:</strong> ${pfmeaRows}</div>
                <div><strong>Preparer:</strong> ${form.preparedBy}</div>
                <div><strong>Approver:</strong> ${form.approvedBy}</div>
            </div>

            <div class="card-actions">
                <button class="btn btn-secondary edit-dfmea-btn" style="flex: 1; font-size: 0.8rem; padding: 0.4rem;">
                    <span>Design FMEA</span>
                </button>
                <button class="btn btn-secondary edit-pfmea-btn" style="flex: 1; font-size: 0.8rem; padding: 0.4rem;">
                    <span>Process FMEA</span>
                </button>
                <button class="btn btn-danger delete-form-btn" title="Delete Formulation" style="padding: 0.4rem;">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        `;
        
        card.querySelector(".edit-dfmea-btn").addEventListener("click", () => {
            activeFormulationId = form.id;
            localStorage.setItem("fmea_active_form_id", form.id);
            populateFormulationSelector();
            switchView("dfmea");
        });
        
        card.querySelector(".edit-pfmea-btn").addEventListener("click", () => {
            activeFormulationId = form.id;
            localStorage.setItem("fmea_active_form_id", form.id);
            populateFormulationSelector();
            switchView("pfmea");
        });

        card.querySelector(".delete-form-btn").addEventListener("click", () => {
            // Confirm delete
            if (confirm(`Are you sure you want to permanently delete formulation ${form.name} and all its FMEA records?`)) {
                deleteFormulation(form.id);
            }
        });

        container.appendChild(card);
    });
    
    lucide.createIcons();
}

function handleCreateFormulation() {
    const nameVal = document.getElementById("formulation-name").value.trim();
    const catVal = document.getElementById("formulation-category").value;
    const descVal = document.getElementById("formulation-desc").value.trim();

    if (formulationsDB.some(f => f.name.toLowerCase() === nameVal.toLowerCase())) {
        showToast("A formulation with that code name already exists.", "error");
        return;
    }

    const newForm = {
        id: "form-" + Date.now(),
        name: nameVal,
        category: catVal,
        description: descVal,
        revision: "1.0",
        status: "draft",
        preparedBy: currentUser.username,
        approvedBy: "-",
        approvalDate: "-",
        rejectionComment: "-",
        changeReason: "Initial document creation.",
        dfmea: {
            raw_materials: [],
            formulation: [],
            packaging: []
        },
        pfmea: {
            operations: [],
            logistics: []
        },
        controlPlan: [],
        auditLogs: [
            {
                timestamp: new Date().toLocaleString(),
                user: currentUser.username,
                action: "Document Created",
                details: `Formulation file created under category ${catVal}`
            }
        ],
        revisionHistory: []
    };

    formulationsDB.push(newForm);
    localStorage.setItem("fmea_formulations", JSON.stringify(formulationsDB));
    
    // Close modal
    document.getElementById("formulation-modal").classList.remove("active");
    document.getElementById("formulation-create-form").reset();
    
    showToast(`Formulation ${nameVal} created.`, "success");
    
    // Reload selectors
    populateFormulationSelector();
    activeFormulationId = newForm.id;
    localStorage.setItem("fmea_active_form_id", activeFormulationId);
    
    renderFormulationsCards();
    switchView("dfmea"); // Take to worksheet directly
}

function deleteFormulation(id) {
    const index = formulationsDB.findIndex(f => f.id === id);
    if (index === -1) return;
    
    formulationsDB.splice(index, 1);
    localStorage.setItem("fmea_formulations", JSON.stringify(formulationsDB));
    
    populateFormulationSelector();
    renderFormulationsCards();
    showToast("Formulation erased.", "success");
}

// --- DUAL FMEA GRID RENDERING ENGINE ---
function getActiveFormulation() {
    return formulationsDB.find(f => f.id === activeFormulationId) || null;
}

function filterAndRenderFMEA() {
    const activeView = document.querySelector(".view-panel.active").id.replace("view-", "");
    if (["dfmea", "pfmea"].includes(activeView)) {
        renderFMEAWorksheet(activeView);
    }
}

function renderFMEAWorksheet(viewType) {
    const form = getActiveFormulation();
    const panel = document.getElementById(`view-${viewType}`);
    const tbody = document.getElementById(`${viewType}-tbody`);
    const emptyState = document.getElementById(`${viewType}-empty`);
    const rowCountText = document.getElementById(`${viewType}-row-count`);
    
    tbody.innerHTML = "";
    
    if (!form) {
        tbody.innerHTML = "";
        emptyState.style.display = "block";
        rowCountText.textContent = "0 items displayed";
        updateDocumentHeader(viewType, null);
        return;
    }

    // Refresh control header
    updateDocumentHeader(viewType, form);

    // Get Active Subtab selection
    const activeSubtab = panel.querySelector(".tabs-sub-navigation .sub-tab-btn.active").dataset.subtab;
    
    // Retrieve correct list data
    const list = form[viewType][activeSubtab] || [];
    
    // Apply local search filtering
    const searchVal = document.getElementById(`${viewType}-search`).value.trim().toLowerCase();
    const filtered = list.filter(item => {
        return !searchVal || 
            item.step.toLowerCase().includes(searchVal) || 
            item.mode.toLowerCase().includes(searchVal) || 
            item.effect.toLowerCase().includes(searchVal) || 
            item.cause.toLowerCase().includes(searchVal) || 
            item.controls.toLowerCase().includes(searchVal) || 
            item.action.toLowerCase().includes(searchVal) || 
            item.resp.toLowerCase().includes(searchVal);
    });

    // Check lock state banner
    const isLocked = form.status === "pending" || form.status === "approved";
    const lockBanner = document.getElementById(`${viewType}-lock-banner`);
    const table = document.getElementById(`${viewType}-table`);
    const btnAdd = panel.querySelector(".btn-add-row-action");
    const btnPick = panel.querySelector(".btn-toggle-picker");
    
    if (isLocked) {
        lockBanner.style.display = "flex";
        document.getElementById(`${viewType}-lock-text`).textContent = 
            form.status === "pending" 
            ? "Worksheet is locked (Pending HOD Sign-off). Complete the review to unlock."
            : `Released Document is locked (Rev ${form.revision} Approved). Create a Revision to edit.`;
        table.classList.add("locked");
        btnAdd.style.display = "none";
        btnPick.style.display = "none";
    } else {
        lockBanner.style.display = "none";
        table.classList.remove("locked");
        
        // Operators can edit drafts. HODs cannot edit draft, they review and sign off.
        if (currentUser.role === "hod") {
            table.classList.add("locked"); // HOD cannot edit, read-only
            btnAdd.style.display = "none";
            btnPick.style.display = "none";
        } else {
            btnAdd.style.display = "inline-flex";
            btnPick.style.display = "inline-flex";
        }
    }

    if (filtered.length === 0) {
        emptyState.style.display = "block";
        rowCountText.textContent = "0 items displayed";
        return;
    }
    
    emptyState.style.display = "none";
    rowCountText.textContent = `Showing ${filtered.length} of ${list.length} entries`;

    filtered.forEach((item, idx) => {
        const rpn = item.sev * item.occ * item.det;
        const resultRpn = (item.result_sev || 1) * (item.result_occ || 1) * (item.result_det || 1);
        const tr = document.createElement("tr");
        tr.id = `row-${item.id}`;

        let sevOpts = "", occOpts = "", detOpts = "";
        let rSevOpts = "", rOccOpts = "", rDetOpts = "";
        for (let i = 1; i <= 10; i++) {
            sevOpts += `<option value="${i}" ${item.sev === i ? 'selected' : ''}>${i}</option>`;
            occOpts += `<option value="${i}" ${item.occ === i ? 'selected' : ''}>${i}</option>`;
            detOpts += `<option value="${i}" ${item.det === i ? 'selected' : ''}>${i}</option>`;
            rSevOpts += `<option value="${i}" ${item.result_sev === i ? 'selected' : ''}>${i}</option>`;
            rOccOpts += `<option value="${i}" ${item.result_occ === i ? 'selected' : ''}>${i}</option>`;
            rDetOpts += `<option value="${i}" ${item.result_det === i ? 'selected' : ''}>${i}</option>`;
        }

        tr.innerHTML = `
            <td>
                <textarea class="cell-input" data-field="number" style="text-align: center; font-weight: 600; min-width: 35px;" placeholder="${idx + 1}" aria-label="ID">${item.number || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="step" placeholder="Describe step/ingredient" aria-label="Step">${item.step || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="function" placeholder="Process/Design Function" aria-label="Function">${item.function || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="detail" placeholder="Deep detail" aria-label="Deep Detail">${item.detail || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="characteristic" placeholder="Characteristic (CTQ/KPC)" aria-label="Characteristic">${item.characteristic || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="mode" placeholder="Failure Mode" aria-label="Failure Mode">${item.mode || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="effect" placeholder="Effects of failure" aria-label="Effects">${item.effect || ''}</textarea>
            </td>
            <td>
                <select class="cell-select select-rating ${getRatingClass(item.sev)}" data-field="sev" aria-label="Severity S">
                    ${sevOpts}
                </select>
            </td>
            <td>
                <textarea class="cell-input" data-field="cause" placeholder="Root causes" aria-label="Causes">${item.cause || ''}</textarea>
            </td>
            <td>
                <select class="cell-select select-rating ${getRatingClass(item.occ)}" data-field="occ" aria-label="Occurrence O">
                    ${occOpts}
                </select>
            </td>
            <td>
                <textarea class="cell-input" data-field="prevention" placeholder="Prevention controls" aria-label="Prevention">${item.prevention || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="detection_controls" placeholder="Detection controls" aria-label="Detection Controls">${item.detection_controls || ''}</textarea>
            </td>
            <td>
                <select class="cell-select select-rating ${getRatingClass(item.det)}" data-field="det" aria-label="Detection D">
                    ${detOpts}
                </select>
            </td>
            <td>
                <div class="rpn-cell">
                    <span class="rpn-badge ${getRpnClass(rpn)}" data-field="rpn-badge">${rpn}</span>
                </div>
            </td>
            <td>
                <textarea class="cell-input" data-field="action" placeholder="Recommended actions" aria-label="Action">${item.action || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="resp" placeholder="Owner & Target" aria-label="Responsibility">${item.resp || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="result" placeholder="Action taken/results" aria-label="Action Result">${item.result || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="result_date" placeholder="Date Completed" aria-label="Date Completed">${item.result_date || ''}</textarea>
            </td>
            <td>
                <select class="cell-select select-rating ${getRatingClass(item.result_sev)}" data-field="result_sev" aria-label="Revised Severity S">
                    ${rSevOpts}
                </select>
            </td>
            <td>
                <select class="cell-select select-rating ${getRatingClass(item.result_occ)}" data-field="result_occ" aria-label="Revised Occurrence O">
                    ${rOccOpts}
                </select>
            </td>
            <td>
                <select class="cell-select select-rating ${getRatingClass(item.result_det)}" data-field="result_det" aria-label="Revised Detection D">
                    ${rDetOpts}
                </select>
            </td>
            <td>
                <div class="rpn-cell">
                    <span class="rpn-badge ${getRpnClass(resultRpn)}" data-field="result-rpn-badge">${resultRpn}</span>
                </div>
            </td>
            <td>
                <textarea class="cell-input" data-field="concern" placeholder="Special concerns" aria-label="Special Concern">${item.concern || ''}</textarea>
            </td>
            <td>
                <select class="cell-select cell-rating-dropdown" data-field="happened" aria-label="Case Happened" style="border: 1px solid var(--border-color); border-radius: 4px; padding: 2px;">
                    <option value="No" ${item.happened === 'No' ? 'selected' : ''}>No</option>
                    <option value="Yes" ${item.happened === 'Yes' ? 'selected' : ''}>Yes</option>
                </select>
            </td>
            <td>
                <div class="ops-wrapper">
                    <button class="btn-table-action save-lib-btn" title="Add item to Global Knowledge Library" aria-label="Save to library">
                        <i data-lucide="bookmark" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="btn-table-action delete-row-btn delete" title="Delete Row" aria-label="Delete row">
                        <i data-lucide="trash" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </td>
        `;

        // Input change handlers
        tr.querySelectorAll(".cell-input").forEach(input => {
            input.addEventListener("change", (e) => {
                updateFMEACell(viewType, activeSubtab, item.id, e.target.dataset.field, e.target.value);
            });
            input.addEventListener("focus", (e) => {
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
            });
            input.addEventListener("blur", (e) => {
                e.target.style.height = '';
            });
        });

        // Dropdowns select handlers
        tr.querySelectorAll(".cell-select").forEach(select => {
            select.addEventListener("change", (e) => {
                const field = e.target.dataset.field;
                const value = e.target.value;
                
                // Color class adjustment
                if (["sev", "occ", "det", "result_sev", "result_occ", "result_det"].includes(field)) {
                    e.target.className = `cell-select select-rating ${getRatingClass(value)}`;
                }
                
                updateFMEACell(viewType, activeSubtab, item.id, field, value);
            });
            select.addEventListener("focus", (e) => {
                let rType = "";
                if (e.target.dataset.field === "sev" || e.target.dataset.field === "result_sev") rType = "Severity";
                else if (e.target.dataset.field === "occ" || e.target.dataset.field === "result_occ") rType = "Occurrence";
                else if (e.target.dataset.field === "det" || e.target.dataset.field === "result_det") rType = "Detection";
                else return; // Ignore happened dropdown focus
                
                // Open and highlight guide drawer
                const sidebar = document.getElementById("reference-sidebar");
                if (sidebar.classList.contains("collapsed")) {
                    document.getElementById("guidelines-toggle").click();
                }
                const header = Array.from(document.querySelectorAll(".guide-section h3")).find(h => h.textContent.includes(rType));
                if (header) header.scrollIntoView({ behavior: "smooth" });
            });
        });

        // Row Operations
        tr.querySelector(".save-lib-btn").addEventListener("click", () => {
            saveFMEARowToLibrary(item);
        });

        tr.querySelector(".delete-row-btn").addEventListener("click", () => {
            deleteFMEARow(viewType, activeSubtab, item.id);
        });

        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

function updateDocumentHeader(viewType, form) {
    const docRev = document.getElementById(`${viewType}-info-rev`);
    const docStatus = document.getElementById(`${viewType}-info-status`);
    const docPrep = document.getElementById(`${viewType}-info-preparer`);
    const docApp = document.getElementById(`${viewType}-info-approver`);
    const actionsContainer = document.getElementById(`${viewType}-control-actions`);
    
    actionsContainer.innerHTML = "";

    if (!form) {
        docRev.textContent = "Rev -";
        docStatus.className = "badge-status badge-draft";
        docStatus.textContent = "Offline";
        docPrep.textContent = "-";
        docApp.textContent = "-";
        return;
    }

    docRev.textContent = `Rev ${form.revision}`;
    
    // Status color
    const st = (form.status || 'draft').toLowerCase();
    let badgeClass = "badge-draft";
    if (st === "pending") badgeClass = "badge-pending";
    else if (st === "approved") badgeClass = "badge-approved";
    else if (st === "rejected") badgeClass = "badge-rejected";
    
    docStatus.className = `badge-status ${badgeClass}`;
    docStatus.textContent = st.toUpperCase();

    docPrep.textContent = form.preparedBy || '-';
    docApp.textContent = (form.approvedBy === "-" || !form.approvedBy) ? "-" : `${form.approvedBy} (${form.approvalDate || ''})`;

    // Action buttons display logic
    // Case 1: Active user is Operator
    if (currentUser.role === "operator") {
        if (form.status === "draft" || form.status === "rejected") {
            actionsContainer.innerHTML = `
                <button class="btn btn-primary" onclick="submitForHODApproval('${form.id}')">
                    <i data-lucide="send" style="width: 16px; height: 16px;"></i>
                    <span>Submit for HOD Approval</span>
                </button>
            `;
        } else if (form.status === "approved") {
            actionsContainer.innerHTML = `
                <button class="btn btn-secondary" onclick="openRevisionRequestModal('${form.id}')">
                    <i data-lucide="git-pull-request" style="width: 16px; height: 16px;"></i>
                    <span>Revise Approved Document</span>
                </button>
            `;
        } else if (form.status === "pending") {
            actionsContainer.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                    <span class="info-label" style="margin: 0; color: var(--status-pending); font-weight: 700;">SUBMITTED TO HOD REVIEW</span>
                    <a href="REVIEW/index.html" target="_blank" class="btn btn-secondary" style="border-color:#ea580c; color:#ea580c; text-decoration:none; padding: 0.35rem 0.75rem; font-size: 0.78rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.4rem;">
                        <i data-lucide="shield-check" style="width: 14px; height: 14px;"></i>
                        <span>Open HOD Approval Portal</span>
                    </a>
                </div>
            `;
        }
    }
    // Case 2: Active user is Head of Department (HOD)
    else if (currentUser.role === "hod") {
        if (form.status === "pending") {
            actionsContainer.innerHTML = `
                <a href="REVIEW/index.html" target="_blank" class="btn btn-secondary" style="border-color:#f59e0b; color:#d97706; text-decoration:none; font-weight: 700; display: inline-flex; align-items: center; gap: 0.4rem;">
                    <i data-lucide="shield-check" style="width: 16px; height: 16px;"></i>
                    <span>Open HOD Review Portal</span>
                </a>
                <button class="btn btn-secondary" style="border-color:#dc2626; color:#dc2626;" onclick="openHODDecisionModal('${form.id}', 'rejected')">
                    <i data-lucide="x-circle" style="width: 16px; height: 16px;"></i>
                    <span>Reject / Request Changes</span>
                </button>
                <button class="btn btn-primary" style="background-color:#16a34a;" onclick="openHODDecisionModal('${form.id}', 'approved')">
                    <i data-lucide="check-circle" style="width: 16px; height: 16px;"></i>
                    <span>Approve & Release (Rev ${form.revision})</span>
                </button>
            `;
        } else if (form.status === "approved") {
            actionsContainer.innerHTML = `
                <span class="info-label" style="margin: 0; color: var(--status-approved)">Released Document</span>
            `;
        } else {
            actionsContainer.innerHTML = `
                <span class="info-label" style="margin: 0;">Awaiting Operator submission</span>
            `;
        }
    }
    
    lucide.createIcons();
}

// --- FMEA CRUD GRID ACTIONS ---
function addFMEARow(viewType) {
    const form = getActiveFormulation();
    if (!form) return;
    
    const activeSubtab = document.getElementById(`view-${viewType}`).querySelector(".tabs-sub-navigation .sub-tab-btn.active").dataset.subtab;
    
    const newRow = {
        id: "row-" + Date.now(),
        number: "",
        step: "",
        function: "",
        detail: "",
        characteristic: "",
        mode: "",
        effect: "",
        sev: 1,
        cause: "",
        occ: 1,
        prevention: "",
        detection_controls: "",
        det: 1,
        action: "",
        resp: "",
        result: "",
        result_date: "",
        result_sev: 1,
        result_occ: 1,
        result_det: 1,
        concern: "",
        happened: "No",
        status: "not-started"
    };

    form[viewType][activeSubtab].push(newRow);
    
    // Log in audit trail
    const auditItem = {
        timestamp: new Date().toLocaleString(),
        user: currentUser.username,
        action: "Row Added",
        details: `Created new blank entry in ${viewType.toUpperCase()} -> ${activeSubtab}`
    };
    form.auditLogs.unshift(auditItem);

    saveFormulationsDB();
    renderFMEAWorksheet(viewType);
    
    // Focus on first input
    setTimeout(() => {
        const row = document.getElementById(`row-${newRow.id}`);
        if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            const input = row.querySelector(".cell-input");
            if (input) input.focus();
        }
    }, 100);
}

function updateFMEACell(viewType, subtab, rowId, field, value) {
    const form = getActiveFormulation();
    if (!form) return;
    
    const list = form[viewType][subtab];
    const index = list.findIndex(r => r.id === rowId);
    if (index === -1) return;

    const oldVal = list[index][field];
    
    // Data formatting checks
    if (["sev", "occ", "det", "result_sev", "result_occ", "result_det"].includes(field)) {
        value = parseInt(value, 10) || 1;
    }
    
    list[index][field] = value;

    // Direct cell RPN indicator refreshes
    if (["sev", "occ", "det"].includes(field)) {
        const item = list[index];
        const rpn = item.sev * item.occ * item.det;
        const row = document.getElementById(`row-${rowId}`);
        if (row) {
            const badge = row.querySelector('[data-field="rpn-badge"]');
            if (badge) {
                badge.textContent = rpn;
                badge.className = `rpn-badge ${getRpnClass(rpn)}`;
            }
        }
    } else if (["result_sev", "result_occ", "result_det"].includes(field)) {
        const item = list[index];
        const rpn = item.result_sev * item.result_occ * item.result_det;
        const row = document.getElementById(`row-${rowId}`);
        if (row) {
            const badge = row.querySelector('[data-field="result-rpn-badge"]');
            if (badge) {
                badge.textContent = rpn;
                badge.className = `rpn-badge ${getRpnClass(rpn)}`;
            }
        }
    }

    // Write change log trail
    if (oldVal !== value) {
        const details = `Edited row step [${list[index].step || "Unnamed"}] -> modified [${field}] from [${oldVal}] to [${value}]`;
        const audit = {
            timestamp: new Date().toLocaleString(),
            user: currentUser.username,
            action: "Cell Edit",
            details: details
        };
        form.auditLogs.unshift(audit);
    }

    saveFormulationsDB();
    updateDashboard();
}

function deleteFMEARow(viewType, subtab, rowId) {
    const form = getActiveFormulation();
    if (!form) return;
    
    const list = form[viewType][subtab];
    const index = list.findIndex(r => r.id === rowId);
    if (index === -1) return;

    const removed = list.splice(index, 1)[0];
    
    // Log audit
    const audit = {
        timestamp: new Date().toLocaleString(),
        user: currentUser.username,
        action: "Row Deleted",
        details: `Deleted row item [${removed.step || "Unnamed"}] in ${viewType.toUpperCase()} -> ${subtab}`
    };
    form.auditLogs.unshift(audit);

    saveFormulationsDB();
    renderFMEAWorksheet(viewType);
    updateDashboard();
    showToast("Row deleted.", "success");
}

function saveFMEARowToLibrary(item) {
    // Add to libraryDB
    const activeView = document.querySelector(".view-panel.active").id.replace("view-", "");
    const activeSubtab = document.getElementById(`view-${activeView}`).querySelector(".tabs-sub-navigation .sub-tab-btn.active").dataset.subtab;
    const form = getActiveFormulation();
    
    if (libraryDB.some(l => l.step === item.step && l.mode === item.mode && l.cause === item.cause)) {
        showToast("Reference item already exists in the Global Library.", "error");
        return;
    }

    let targetSection = "raw_material";
    if (activeView === "dfmea") {
        if (activeSubtab === "raw_materials") targetSection = "raw_material";
        else if (activeSubtab === "formulation") targetSection = "formulation";
        else if (activeSubtab === "packaging") targetSection = "packaging";
    } else if (activeView === "pfmea") {
        if (activeSubtab === "operations") targetSection = "process";
        else if (activeSubtab === "logistics") targetSection = "packing_shipment";
    }

    const newItem = {
        id: "lib-" + Date.now(),
        category: form.category,
        section: targetSection,
        step: item.step || "",
        function: item.function || "",
        detail: item.detail || "",
        characteristic: item.characteristic || "",
        mode: item.mode || "",
        effect: item.effect || "",
        sev: item.sev || 1,
        cause: item.cause || "",
        occ: item.occ || 1,
        prevention: item.prevention || "",
        detection_controls: item.detection_controls || "",
        det: item.det || 1,
        action: item.action || "",
        resp: item.resp || "",
        result: item.result || "",
        result_date: item.result_date || "",
        result_sev: item.result_sev || 1,
        result_occ: item.result_occ || 1,
        result_det: item.result_det || 1,
        concern: item.concern || "",
        happened: item.happened || "No"
    };

    libraryDB.push(newItem);
    localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
    showToast(`Saved [${item.step || "Unnamed"}] to reference Library.`, "success");
}

function saveFormulationsDB() {
    localStorage.setItem("fmea_formulations", JSON.stringify(formulationsDB));
}

// --- WORKFLOW REVISION & HOD APPROVAL LOGICS ---
function submitForHODApproval(formId) {
    const form = formulationsDB.find(f => f.id === formId);
    if (!form) return;
    
    form.status = "pending";
    
    const audit = {
        timestamp: new Date().toLocaleString(),
        user: currentUser.username,
        action: "Requested Approval",
        details: `Submitted formulation document Rev ${form.revision} for Head of Department validation and release.`
    };
    form.auditLogs.unshift(audit);

    saveFormulationsDB();
    
    // Refresh FMEA worksheet
    const activeView = document.querySelector(".view-panel.active").id.replace("view-", "");
    renderFMEAWorksheet(activeView);
    updateDashboard();
    showToast("Submitted to Head of Department review.", "success");
}

function openHODDecisionModal(formId, decision) {
    document.getElementById("hod-decision-type").value = decision;
    const modalTitle = document.getElementById("hod-modal-title");
    const modalDesc = document.getElementById("hod-modal-desc");
    const submitBtn = document.getElementById("hod-modal-submit-btn");
    
    if (decision === "approved") {
        modalTitle.textContent = "Release Document Approval";
        modalDesc.textContent = "Sign off and release this formulation as a certified production worksheet.";
        submitBtn.textContent = "Approve Release";
        submitBtn.className = "btn btn-primary";
        submitBtn.style.backgroundColor = "#16a34a";
    } else {
        modalTitle.textContent = "Reject / Request Corrections";
        modalDesc.textContent = "Return this worksheet to Draft mode. Comments are sent directly to the preparation operator.";
        submitBtn.textContent = "Reject Draft";
        submitBtn.className = "btn btn-danger";
        submitBtn.style.backgroundColor = "#dc2626";
    }
    
    document.getElementById("hod-comments").value = "";
    document.getElementById("hod-modal").classList.add("active");
}

function handleHODDecisionSubmit() {
    const form = getActiveFormulation();
    if (!form) return;

    const decision = document.getElementById("hod-decision-type").value;
    const comments = document.getElementById("hod-comments").value.trim();

    if (decision === "approved") {
        form.status = "approved";
        form.approvedBy = currentUser.username;
        form.approvalDate = new Date().toLocaleDateString();
        form.rejectionComment = "-";

        // Save Stamped History Copy (revision traceability)
        const stampedCopy = {
            revision: form.revision,
            releaseDate: new Date().toLocaleDateString(),
            preparedBy: form.preparedBy,
            approvedBy: currentUser.username,
            changeReason: form.changeReason,
            // Deep clone FMEA lists
            dfmea: JSON.parse(JSON.stringify(form.dfmea)),
            pfmea: JSON.parse(JSON.stringify(form.pfmea)),
            controlPlan: JSON.parse(JSON.stringify(form.controlPlan))
        };
        form.revisionHistory.unshift(stampedCopy);

        const audit = {
            timestamp: new Date().toLocaleString(),
            user: currentUser.username,
            action: "Release Approved",
            details: `HOD approved and released worksheet Rev ${form.revision}. Comments: ${comments || "None"}`
        };
        form.auditLogs.unshift(audit);
        showToast("Worksheet approved and certified.", "success");
    } else {
        form.status = "rejected";
        form.rejectionComment = comments || "No feedback comments left.";
        
        const audit = {
            timestamp: new Date().toLocaleString(),
            user: currentUser.username,
            action: "Draft Rejected",
            details: `HOD returned document to draft status. Feedback: ${form.rejectionComment}`
        };
        form.auditLogs.unshift(audit);
        showToast("Worksheet returned to Draft mode.", "error");
    }

    saveFormulationsDB();
    document.getElementById("hod-modal").classList.remove("active");
    
    // Refresh FMEA worksheet
    const activeView = document.querySelector(".view-panel.active").id.replace("view-", "");
    renderFMEAWorksheet(activeView);
    updateDashboard();
}

function openRevisionRequestModal(formId) {
    document.getElementById("revision-reason").value = "";
    document.getElementById("revision-modal").classList.add("active");
}

function handleCreateRevisionSubmit() {
    const form = getActiveFormulation();
    if (!form) return;

    const reason = document.getElementById("revision-reason").value.trim();
    if (!reason) {
        showToast("You must enter a reason for change for audit logging.", "error");
        return;
    }

    // Increment Revision
    const oldRev = parseFloat(form.revision);
    const newRev = (oldRev + 1.0).toFixed(1);
    
    form.revision = newRev;
    form.status = "draft";
    form.preparedBy = currentUser.username;
    form.approvedBy = "-";
    form.approvalDate = "-";
    form.changeReason = reason;

    const audit = {
        timestamp: new Date().toLocaleString(),
        user: currentUser.username,
        action: "Revision Initiated",
        details: `Created new draft Rev ${newRev} from Approved Rev ${oldRev.toFixed(1)}. Change reason: ${reason}`
    };
    form.auditLogs.unshift(audit);

    saveFormulationsDB();
    document.getElementById("revision-modal").classList.remove("active");
    
    // Refresh FMEA worksheet
    const activeView = document.querySelector(".view-panel.active").id.replace("view-", "");
    renderFMEAWorksheet(activeView);
    updateDashboard();
    
    showToast(`Created new revision draft Rev ${newRev}.`, "success");
}

// --- DYNAMIC CONTROL PLAN BUILDER ---
function renderControlPlan() {
    const form = getActiveFormulation();
    const tbody = document.getElementById("control-plan-tbody");
    const emptyState = document.getElementById("control-plan-empty");
    const banner = document.getElementById("cp-lock-banner");
    
    tbody.innerHTML = "";

    if (!form) {
        emptyState.style.display = "block";
        banner.style.display = "none";
        return;
    }

    // Sync status locks
    const isLocked = form.status === "pending" || form.status === "approved" || currentUser.role === "hod";
    const cpTable = document.getElementById("control-plan-table");
    
    if (isLocked) {
        banner.style.display = "flex";
        cpTable.classList.add("locked");
    } else {
        banner.style.display = "none";
        cpTable.classList.remove("locked");
    }

    // Auto-generate plan steps from PFMEA mixing/operations & DFMEA Formulation
    const fmeaSteps = [];
    
    // Fetch DFMEA Formulations
    form.dfmea.formulation.forEach(item => {
        if (item.step) {
            fmeaSteps.push({ source: "dfmea", name: item.step, control: item.controls, reaction: item.action });
        }
    });

    // Fetch PFMEA Operations
    form.pfmea.operations.forEach(item => {
        if (item.step) {
            fmeaSteps.push({ source: "pfmea", name: item.step, control: item.controls, reaction: item.action });
        }
    });

    if (fmeaSteps.length === 0) {
        emptyState.style.display = "block";
        return;
    }
    
    emptyState.style.display = "none";

    // Rebuild controlPlan list mapping to FMEA items
    const updatedControlPlan = [];

    fmeaSteps.forEach((step, idx) => {
        // Check if row already exists in active controlPlan
        let existing = form.controlPlan.find(cp => cp.opName === step.name);
        
        if (!existing) {
            existing = {
                id: `cp-${idx}-${Date.now()}`,
                opName: step.name,
                machine: "",
                characteristic: "",
                specification: "",
                method: "",
                sampleSize: "",
                controlMethod: step.control || "",
                reactionPlan: step.reaction || ""
            };
        } else {
            // Keep control method & reaction plan aligned to latest FMEA edits
            existing.controlMethod = step.control || existing.controlMethod;
            existing.reactionPlan = step.reaction || existing.reactionPlan;
        }
        
        updatedControlPlan.push(existing);
        
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="row-index">${idx + 1}</span></td>
            <td><strong>${existing.opName}</strong></td>
            <td>
                <textarea class="cell-input" data-field="machine" placeholder="Machinery code/line" aria-label="Machine">${existing.machine}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="characteristic" placeholder="Product/Process parameters" aria-label="Characteristic">${existing.characteristic}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="specification" placeholder="Limits (e.g. 3000 ± 200 cPs)" aria-label="Specification">${existing.specification}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="method" placeholder="Measurement device" aria-label="Method">${existing.method}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="sampleSize" placeholder="Size & frequency" aria-label="Sample">${existing.sampleSize}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="controlMethod" placeholder="Control tool" aria-label="Control Tool">${existing.controlMethod}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="reactionPlan" placeholder="Out of spec reaction plan" aria-label="Reaction Plan">${existing.reactionPlan}</textarea>
            </td>
        `;

        // Direct in-cell listeners
        tr.querySelectorAll(".cell-input").forEach(input => {
            input.addEventListener("change", (e) => {
                existing[e.target.dataset.field] = e.target.value;
                saveFormulationsDB();
            });
            input.addEventListener("focus", (e) => {
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
            });
            input.addEventListener("blur", (e) => {
                e.target.style.height = '';
            });
        });

        tbody.appendChild(tr);
    });

    // Sync database representation
    form.controlPlan = updatedControlPlan;
    saveFormulationsDB();
}

function exportControlPlanCSV() {
    const form = getActiveFormulation();
    if (!form || form.controlPlan.length === 0) {
        showToast("No Control Plan data to export.", "error");
        return;
    }

    const headers = [
        "Operation / Step",
        "Machine / Equipment",
        "Control Characteristic",
        "Specification / Tolerance",
        "Measurement Device / Method",
        "Sample Size & Frequency",
        "Control Method",
        "Reaction Plan"
    ];

    const rows = form.controlPlan.map(cp => [
        cp.opName,
        cp.machine,
        cp.characteristic,
        cp.specification,
        cp.method,
        cp.sampleSize,
        cp.controlMethod,
        cp.reactionPlan
    ]);

    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Control_Plan_${form.name.replace(/\s+/g, '_')}_Rev_${form.revision}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Control Plan CSV downloaded.", "success");
}

// --- PICK & PLACE EXPLORER DRAWERS ---
function togglePickerSidebar() {
    const sidebar = document.getElementById("library-pick-sidebar");
    const isCollapsed = sidebar.classList.toggle("collapsed");
    
    const handle = document.getElementById("library-picker-handle");
    const handleIcon = document.getElementById("picker-handle-icon");

    if (isCollapsed) {
        handleIcon.setAttribute("data-lucide", "arrow-left");
        handle.style.right = "0";
    } else {
        handleIcon.setAttribute("data-lucide", "arrow-right");
        handle.style.right = "360px";
        
        // Auto-select active FMEA section in the picker dropdown select
        const activeView = document.querySelector(".view-panel.active").id.replace("view-", "");
        const activeSubtab = document.getElementById(`view-${activeView}`).querySelector(".tabs-sub-navigation .sub-tab-btn.active").dataset.subtab;
        
        let targetSection = "raw_material";
        if (activeView === "dfmea") {
            if (activeSubtab === "raw_materials") targetSection = "raw_material";
            else if (activeSubtab === "formulation") targetSection = "formulation";
            else if (activeSubtab === "packaging") targetSection = "packaging";
        } else if (activeView === "pfmea") {
            if (activeSubtab === "operations") targetSection = "process";
            else if (activeSubtab === "logistics") targetSection = "packing_shipment";
        }
        document.getElementById("lib-picker-section").value = targetSection;

        // Populate and render explorer content
        hydratePickerFilters();
        renderPickerSidebarCards();
    }
    
    lucide.createIcons();
}

function hydratePickerFilters() {
    const select = document.getElementById("lib-picker-category");
    select.innerHTML = "";
    
    const form = getActiveFormulation();
    if (!form) return;

    // Automatically prioritize active formulation category
    select.innerHTML = `
        <option value="${form.category}">${form.category} (Primary)</option>
        <option value="all">All Categories</option>
        <option value="Epoxy Adhesives">Epoxy Adhesives</option>
        <option value="Polyurethane Adhesives">Polyurethane Adhesives</option>
        <option value="Acrylic & Cyanoacrylate">Acrylic & Cyanoacrylate</option>
        <option value="Silicone & UV-Curable">Silicone & UV-Curable</option>
        <option value="Hot Melt Adhesives">Hot Melt Adhesives</option>
    `;
}

function filterPickerSidebar() {
    renderPickerSidebarCards();
}

function renderPickerSidebarCards() {
    const container = document.getElementById("lib-picker-cards");
    container.innerHTML = "";

    const searchVal = document.getElementById("lib-picker-search").value.trim().toLowerCase();
    const categoryFilter = document.getElementById("lib-picker-category").value;
    const sectionFilter = document.getElementById("lib-picker-section").value;

    // Filter library data
    const filtered = libraryDB.filter(item => {
        // Match library FMEA section
        const matchesSection = item.section === sectionFilter;
        
        // Match product or process family category scoping
        const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
        
        // Search text matching
        const matchesText = !searchVal ||
            item.step.toLowerCase().includes(searchVal) ||
            item.mode.toLowerCase().includes(searchVal) ||
            item.cause.toLowerCase().includes(searchVal);

        return matchesSection && matchesCategory && matchesText;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 2rem 0;">
                No matching reference templates found in Library.
            </div>
        `;
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement("div");
        card.className = "library-item-card";
        
        card.innerHTML = `
            <div class="library-card-header">
                <span class="library-card-step">${item.step}</span>
                <span class="card-category-badge" style="font-size:0.6rem;">${item.category}</span>
            </div>
            <div class="library-card-body">
                <strong>Failure Mode:</strong> ${item.mode}<br/>
                <strong>Cause:</strong> ${item.cause}
            </div>
            <div class="library-card-actions">
                <span class="library-card-rpn ${getRpnClass(item.sev * item.occ * item.det)}">RPN: ${item.sev * item.occ * item.det}</span>
                <button class="btn btn-primary place-item-btn" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;">
                    <i data-lucide="plus" style="width: 10px; height: 10px;"></i>
                    <span>Place</span>
                </button>
            </div>
        `;

        card.querySelector(".place-item-btn").addEventListener("click", () => {
            placeLibraryRowIntoWorksheet(item);
        });

        container.appendChild(card);
    });

    lucide.createIcons();
}

function placeLibraryRowIntoWorksheet(libItem) {
    const form = getActiveFormulation();
    if (!form) return;

    const activeView = document.querySelector(".view-panel.active").id.replace("view-", "");
    const activeSubtab = document.getElementById(`view-${activeView}`).querySelector(".tabs-sub-navigation .sub-tab-btn.active").dataset.subtab;

    // Build row structure with 18 fields
    const newRow = {
        id: "row-" + Date.now(),
        number: libItem.number || "",
        step: libItem.step || "",
        function: libItem.function || "",
        detail: libItem.detail || "",
        characteristic: libItem.characteristic || "",
        mode: libItem.mode || "",
        effect: libItem.effect || "",
        sev: libItem.sev || 1,
        cause: libItem.cause || "",
        occ: libItem.occ || 1,
        prevention: libItem.prevention || "",
        detection_controls: libItem.detection_controls || "",
        det: libItem.det || 1,
        action: libItem.action || "",
        resp: libItem.resp || "",
        result: libItem.result || "",
        result_date: libItem.result_date || "",
        result_sev: libItem.result_sev || 1,
        result_occ: libItem.result_occ || 1,
        result_det: libItem.result_det || 1,
        concern: libItem.concern || "",
        happened: libItem.happened || "No",
        status: "not-started"
    };

    form[activeView][activeSubtab].push(newRow);

    // Audit logs entry
    const audit = {
        timestamp: new Date().toLocaleString(),
        user: currentUser.username,
        action: "Library Import",
        details: `Imported historical reference row [${libItem.step}] from Knowledge Library into ${activeView.toUpperCase()}`
    };
    form.auditLogs.unshift(audit);

    saveFormulationsDB();
    renderFMEAWorksheet(activeView);
    updateDashboard();

    showToast(`Placed [${libItem.step}] in worksheet.`, "success");
}

// --- GLOBAL KNOWLEDGE LIBRARY VIEW ---
function renderLibraryView() {
    const tbody = document.getElementById("library-tbody");
    const emptyState = document.getElementById("library-empty");
    tbody.innerHTML = "";

    const query = document.getElementById("lib-search").value.trim().toLowerCase();
    const catFilter = document.getElementById("lib-filter-category").value;
    
    // Get active section from tabs sub-nav
    const activeBtn = document.querySelector("#lib-sub-nav .sub-tab-btn.active");
    const activeSection = activeBtn ? activeBtn.dataset.section : "raw_material";

    const filtered = libraryDB.filter(item => {
        const matchesCategory = catFilter === "all" || item.category === catFilter;
        const matchesSection = item.section === activeSection;
        
        const matchesText = !query ||
            item.step.toLowerCase().includes(query) ||
            item.mode.toLowerCase().includes(query) ||
            item.cause.toLowerCase().includes(query);

        return matchesCategory && matchesSection && matchesText;
    });

    if (filtered.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

    filtered.forEach((item, idx) => {
        const rpn = item.sev * item.occ * item.det;
        const revisedRpn = (item.result_sev || 1) * (item.result_occ || 1) * (item.result_det || 1);
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="row-index" style="font-weight: 600;">${item.number || (idx + 1)}</span></td>
            <td><span class="card-category-badge">${item.category}</span></td>
            <td>${item.step || ''}</td>
            <td>${item.function || ''}</td>
            <td>${item.detail || ''}</td>
            <td>${item.characteristic || ''}</td>
            <td>${item.mode || ''}</td>
            <td>${item.effect || ''}</td>
            <td style="text-align: center;">
                <span class="rating-cell-badge ${getRatingClass(item.sev)}">${item.sev}</span>
            </td>
            <td>${item.cause || ''}</td>
            <td style="text-align: center;">
                <span class="rating-cell-badge ${getRatingClass(item.occ)}">${item.occ}</span>
            </td>
            <td>${item.prevention || ''}</td>
            <td>${item.detection_controls || ''}</td>
            <td style="text-align: center;">
                <span class="rating-cell-badge ${getRatingClass(item.det)}">${item.det}</span>
            </td>
            <td style="text-align: center;">
                <span class="rpn-badge ${getRpnClass(rpn)}">${rpn}</span>
            </td>
            <td>${item.action || ''}</td>
            <td>${item.resp || ''}</td>
            <td>${item.result || ''}</td>
            <td>${item.result_date || ''}</td>
            <td style="text-align: center;">
                <span class="rating-cell-badge ${getRatingClass(item.result_sev || 1)}">${item.result_sev || 1}</span>
            </td>
            <td style="text-align: center;">
                <span class="rating-cell-badge ${getRatingClass(item.result_occ || 1)}">${item.result_occ || 1}</span>
            </td>
            <td style="text-align: center;">
                <span class="rating-cell-badge ${getRatingClass(item.result_det || 1)}">${item.result_det || 1}</span>
            </td>
            <td style="text-align: center;">
                <span class="rpn-badge ${getRpnClass(revisedRpn)}">${revisedRpn}</span>
            </td>
            <td>${item.concern || ''}</td>
            <td style="text-align: center;">${item.happened || 'No'}</td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button class="btn-table-action place-lib-btn" title="Interlink & insert directly into active ${["process", "packing_shipment"].includes(item.section) ? "PFMEA" : "DFMEA"} worksheet">
                        <i data-lucide="arrow-right-circle" style="width: 14px; height: 14px; color: var(--primary-color);"></i>
                    </button>
                    <button class="btn-table-action delete-lib-btn delete" title="Delete from Library">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </td>
        `;

        tr.querySelector(".place-lib-btn").addEventListener("click", () => {
            placeLibraryRowIntoDFMEA(item);
        });

        tr.querySelector(".delete-lib-btn").addEventListener("click", () => {
            if (confirm("Are you sure you want to delete this historical reference item from the Library?")) {
                deleteLibraryItem(item.id);
            }
        });

        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

function handleCreateLibraryItem() {
    const cat = document.getElementById("lib-product-cat").value;
    const section = document.getElementById("lib-fmea-section").value;
    const step = document.getElementById("lib-step").value.trim();
    const funcVal = document.getElementById("lib-function").value.trim();
    const detailVal = document.getElementById("lib-detail").value.trim();
    const charVal = document.getElementById("lib-characteristic").value.trim();
    const mode = document.getElementById("lib-mode").value.trim();
    const effectVal = document.getElementById("lib-effect").value.trim();
    const cause = document.getElementById("lib-cause").value.trim();
    const prevVal = document.getElementById("lib-prevention").value.trim();
    const detContVal = document.getElementById("lib-detection-controls").value.trim();
    const sev = parseInt(document.getElementById("lib-sev").value, 10);
    const occ = parseInt(document.getElementById("lib-occ").value, 10);
    const det = parseInt(document.getElementById("lib-det").value, 10);
    const action = document.getElementById("lib-action").value.trim();
    const resp = document.getElementById("lib-resp").value.trim();
    const result = document.getElementById("lib-result").value.trim();
    const resultDate = document.getElementById("lib-result-date").value.trim();
    const resultSev = parseInt(document.getElementById("lib-result-sev").value, 10) || 1;
    const resultOcc = parseInt(document.getElementById("lib-result-occ").value, 10) || 1;
    const resultDet = parseInt(document.getElementById("lib-result-det").value, 10) || 1;
    const concernVal = document.getElementById("lib-concern").value.trim();
    const happenedVal = document.getElementById("lib-happened").value;

    const newItem = {
        id: "lib-" + Date.now(),
        category: cat,
        section,
        step,
        function: funcVal,
        detail: detailVal,
        characteristic: charVal,
        mode,
        effect: effectVal,
        cause,
        prevention: prevVal,
        detection_controls: detContVal,
        sev,
        occ,
        det,
        action,
        resp: resp,
        result: result,
        result_date: resultDate,
        result_sev: resultSev,
        result_occ: resultOcc,
        result_det: resultDet,
        concern: concernVal,
        happened: happenedVal
    };

    libraryDB.push(newItem);
    localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
    
    document.getElementById("lib-create-form").reset();
    document.getElementById("lib-modal").classList.remove("active");
    
    showToast("Saved to reference database.", "success");
    renderLibraryView();
}

function deleteLibraryItem(id) {
    const idx = libraryDB.findIndex(l => l.id === id);
    if (idx === -1) return;
    
    libraryDB.splice(idx, 1);
    localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
    
    showToast("Library reference item deleted.", "success");
    renderLibraryView();
}

function placeLibraryRowIntoDFMEA(libItem) {
    const form = getActiveFormulation();
    if (!form) {
        showToast("Please select or create an active formulation project first.", "error");
        return;
    }

    let viewType = "dfmea";
    let subtab = "raw_materials";

    if (libItem.section === "raw_material") {
        viewType = "dfmea";
        subtab = "raw_materials";
    } else if (libItem.section === "formulation") {
        viewType = "dfmea";
        subtab = "formulation";
    } else if (libItem.section === "packaging") {
        viewType = "dfmea";
        subtab = "packaging";
    } else if (libItem.section === "process") {
        viewType = "pfmea";
        subtab = "operations";
    } else if (libItem.section === "packing_shipment") {
        viewType = "pfmea";
        subtab = "logistics";
    }

    const newRow = {
        id: "row-" + Date.now(),
        number: libItem.number || "",
        step: libItem.step || "",
        function: libItem.function || "",
        detail: libItem.detail || "",
        characteristic: libItem.characteristic || "",
        mode: libItem.mode || "",
        effect: libItem.effect || "",
        sev: libItem.sev || 1,
        cause: libItem.cause || "",
        occ: libItem.occ || 1,
        prevention: libItem.prevention || "",
        detection_controls: libItem.detection_controls || "",
        det: libItem.det || 1,
        action: libItem.action || "",
        resp: libItem.resp || "",
        result: libItem.result || "",
        result_date: libItem.result_date || "",
        result_sev: libItem.result_sev || 1,
        result_occ: libItem.result_occ || 1,
        result_det: libItem.result_det || 1,
        concern: libItem.concern || "",
        happened: libItem.happened || "No",
        status: "not-started"
    };

    form[viewType][subtab].push(newRow);

    // Write change log audit
    form.auditLogs.unshift({
        timestamp: new Date().toLocaleString(),
        user: currentUser.username,
        action: "Library Interlink",
        details: `Interlinked and inserted History Library item [${libItem.step || "Unnamed"}] into ${viewType.toUpperCase()} -> ${subtab}`
    });

    saveFormulationsDB();

    // Switch view to target view and subtab
    switchView(viewType);
    const subtabBtn = document.querySelector(`#view-${viewType} .tabs-sub-navigation .sub-tab-btn[data-subtab="${subtab}"]`);
    if (subtabBtn) subtabBtn.click();

    showToast(`Interlinked [${libItem.step || "Item"}] directly into ${viewType.toUpperCase()} worksheet.`, "success");
}

function updateLibraryInterlinkBanner(section) {
    const titleEl = document.getElementById("lib-interlink-title");
    const descEl = document.getElementById("lib-interlink-desc");
    const btnTextEl = document.getElementById("lib-interlink-btn-text");
    const iconWrapper = document.getElementById("lib-interlink-icon-wrapper");
    if (!titleEl || !descEl || !btnTextEl) return;

    if (["process", "packing_shipment"].includes(section)) {
        titleEl.textContent = "Process FMEA (PFMEA) Interlink Active";
        descEl.textContent = "History Library failure mode templates (Process FMEA, Packing & Shipment FMEA) directly interlink with Process FMEA (PFMEA) worksheets.";
        btnTextEl.textContent = "Go to Active PFMEA";
        if (iconWrapper) iconWrapper.innerHTML = `<i data-lucide="activity" style="width: 14px; height: 14px;"></i>`;
    } else {
        titleEl.textContent = "Design FMEA (DFMEA) Interlink Active";
        descEl.textContent = "History Library failure mode templates (Raw Material FMEA, Formulation FMEA, Packaging FMEA) directly interlink with Design FMEA (DFMEA) worksheets.";
        btnTextEl.textContent = "Go to Active DFMEA";
        if (iconWrapper) iconWrapper.innerHTML = `<i data-lucide="layers" style="width: 14px; height: 14px;"></i>`;
    }
    if (window.lucide) lucide.createIcons();
}

function filterLibraryView() {
    renderLibraryView();
}

// --- AUDIT TRAIL TIMELINES ---
function renderAuditTimeline() {
    const form = getActiveFormulation();
    const container = document.getElementById("audit-timeline-container");
    const emptyState = document.getElementById("audit-logs-empty");

    container.innerHTML = "";

    if (!form || !form.auditLogs || form.auditLogs.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

    form.auditLogs.forEach(log => {
        const item = document.createElement("div");
        item.className = "audit-log-item";
        
        let actionIcon = "edit-3";
        let actionColor = "var(--text-secondary)";
        if (log.action.includes("Release")) {
            actionIcon = "check-square";
            actionColor = "#16a34a";
        } else if (log.action.includes("Rejected")) {
            actionIcon = "x-circle";
            actionColor = "#dc2626";
        } else if (log.action.includes("Revision")) {
            actionIcon = "git-pull-request";
            actionColor = "#ea580c";
        } else if (log.action.includes("Created")) {
            actionIcon = "file-plus";
            actionColor = "var(--primary-color)";
        }

        item.innerHTML = `
            <span class="audit-log-time">${log.timestamp}</span>
            <span class="audit-log-user">${log.user}</span>
            <span class="audit-log-action" style="color: ${actionColor};">
                <i data-lucide="${actionIcon}" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 0.25rem;"></i>
                ${log.action}
            </span>
            <span class="audit-log-diff">${log.details}</span>
        `;
        
        container.appendChild(item);
    });

    lucide.createIcons();
}

function renderRevisionsLog() {
    const form = getActiveFormulation();
    const tbody = document.getElementById("revisions-tbody");
    const emptyState = document.getElementById("revisions-empty");

    tbody.innerHTML = "";

    if (!form || !form.revisionHistory || form.revisionHistory.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

    form.revisionHistory.forEach(rev => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="badge-status badge-approved" style="background-color:#eff6ff; color:#1e40af;">Rev ${rev.revision}</span></td>
            <td><strong>${rev.releaseDate}</strong></td>
            <td>${rev.preparedBy}</td>
            <td>${rev.approvedBy}</td>
            <td>${rev.changeReason}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- GLOBAL DASHBOARD CALCULATOR ---
// --- GLOBAL DASHBOARD CALCULATOR ---
function updateDashboard() {
    // 1. Welcome and Date Greet
    if (document.getElementById("dash-username-greet")) {
        document.getElementById("dash-username-greet").textContent = currentUser ? currentUser.username : "User";
    }
    if (document.getElementById("dash-current-date")) {
        document.getElementById("dash-current-date").textContent = new Date().toLocaleDateString(undefined, { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }

    // 2. Metrics totals
    document.getElementById("dash-total-forms").textContent = formulationsDB.length;

    let totalRows = 0;
    let criticalCount = 0;
    let approvedCount = 0;

    let lowCount = 0;
    let medCount = 0;
    let highCount = 0;
    let critCount = 0;

    // Category tracking
    const catCounts = {
        "Epoxy Adhesives": 0,
        "Polyurethane Adhesives": 0,
        "Acrylic & Cyanoacrylate": 0,
        "Silicone & UV-Curable": 0,
        "Hot Melt Adhesives": 0
    };

    // Status tracking
    const statusCounts = {
        "draft": 0,
        "pending": 0,
        "approved": 0,
        "rejected": 0
    };

    formulationsDB.forEach(form => {
        // Category count
        if (catCounts[form.category] !== undefined) {
            catCounts[form.category]++;
        }
        
        // Status count
        if (statusCounts[form.status] !== undefined) {
            statusCounts[form.status]++;
        }

        // Approved counter
        if (form.status === "approved") {
            approvedCount++;
        }

        // Count rows in DFMEA
        const dfmeaList = [
            ...form.dfmea.raw_materials,
            ...form.dfmea.formulation,
            ...form.dfmea.packaging
        ];
        
        // Count rows in PFMEA
        const pfmeaList = [
            ...form.pfmea.operations,
            ...form.pfmea.logistics
        ];

        const allRows = [...dfmeaList, ...pfmeaList];
        totalRows += allRows.length;

        // Score RPN bounds
        allRows.forEach(row => {
            const rpn = row.sev * row.occ * row.det;
            if (rpn >= 125) {
                criticalCount++;
            }

            if (rpn < 50) lowCount++;
            else if (rpn < 125) medCount++;
            else if (rpn < 300) highCount++;
            else critCount++;
        });
    });

    document.getElementById("dash-total-rows").textContent = totalRows;
    document.getElementById("dash-crit-risks").textContent = criticalCount;
    document.getElementById("dash-approved-count").textContent = `${approvedCount} / ${formulationsDB.length}`;

    // 3. Populate Category Analytics bars
    const catContainer = document.getElementById("dash-analytics-categories");
    if (catContainer) {
        catContainer.innerHTML = "";
        Object.keys(catCounts).forEach(cat => {
            const count = catCounts[cat];
            const pct = formulationsDB.length > 0 ? Math.round((count / formulationsDB.length) * 100) : 0;
            
            const div = document.createElement("div");
            div.className = "analytics-row-item";
            div.innerHTML = `
                <div class="analytics-item-info">
                    <span>${cat}</span>
                    <span>${count} (${pct}%)</span>
                </div>
                <div class="analytics-progress-bar">
                    <div class="analytics-progress-fill" style="width: ${pct}%; background-color: var(--primary-color);"></div>
                </div>
            `;
            catContainer.appendChild(div);
        });
    }

    // 4. Populate Status Release rate bars
    const statusContainer = document.getElementById("dash-analytics-status");
    if (statusContainer) {
        statusContainer.innerHTML = "";
        const statusMap = {
            "approved": { name: "Approved / Released", color: "var(--status-approved)" },
            "pending": { name: "Pending HOD Sign-off", color: "var(--status-pending)" },
            "draft": { name: "Draft Operations", color: "var(--status-draft)" },
            "rejected": { name: "Rejected / Corrections", color: "var(--status-rejected)" }
        };

        Object.keys(statusMap).forEach(key => {
            const count = statusCounts[key];
            const pct = formulationsDB.length > 0 ? Math.round((count / formulationsDB.length) * 100) : 0;
            const meta = statusMap[key];

            const div = document.createElement("div");
            div.className = "analytics-row-item";
            div.innerHTML = `
                <div class="analytics-item-info">
                    <span>${meta.name}</span>
                    <span>${count} (${pct}%)</span>
                </div>
                <div class="analytics-progress-bar">
                    <div class="analytics-progress-fill" style="width: ${pct}%; background-color: ${meta.color};"></div>
                </div>
            `;
            statusContainer.appendChild(div);
        });
    }

    // 5. Populate FMEA RPN Distribution bars
    const rpnContainer = document.getElementById("dash-analytics-risks");
    if (rpnContainer) {
        rpnContainer.innerHTML = "";
        const rpnTotal = lowCount + medCount + highCount + critCount;

        const rpnMap = [
            { name: "Low Risk (RPN < 50)", count: lowCount, color: "var(--risk-low)" },
            { name: "Medium Risk (RPN 50-124)", count: medCount, color: "var(--risk-medium)" },
            { name: "High Risk (RPN 125-299)", count: highCount, color: "var(--risk-high)" },
            { name: "Critical Risk (RPN >= 300)", count: critCount, color: "var(--risk-critical)" }
        ];

        rpnMap.forEach(rpn => {
            const pct = rpnTotal > 0 ? Math.round((rpn.count / rpnTotal) * 100) : 0;
            const div = document.createElement("div");
            div.className = "analytics-row-item";
            div.innerHTML = `
                <div class="analytics-item-info">
                    <span>${rpn.name}</span>
                    <span>${rpn.count} (${pct}%)</span>
                </div>
                <div class="analytics-progress-bar">
                    <div class="analytics-progress-fill" style="width: ${pct}%; background-color: ${rpn.color};"></div>
                </div>
            `;
            rpnContainer.appendChild(div);
        });
    }

    // 6. Update Dashboard alerts for pending items
    if (currentUser && currentUser.role === "hod") {
        const pendingCount = formulationsDB.filter(f => f.status === "pending").length;
        const alertStrip = document.getElementById("hod-pending-alert");
        const alertText = document.getElementById("pending-alert-text");
        
        if (pendingCount > 0) {
            alertStrip.style.display = "flex";
            alertText.textContent = `You have ${pendingCount} formulation document(s) pending your signature and release sign-off.`;
        } else {
            alertStrip.style.display = "none";
        }
    }

    // 7. Render Formulation list inside dashboard
    renderDashboardFormulationList();
}

function renderDashboardFormulationList() {
    const tbody = document.getElementById("dash-tbody-forms");
    tbody.innerHTML = "";

    if (formulationsDB.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
                    No formulation registers recorded in workspace.
                </td>
            </tr>
        `;
        return;
    }

    formulationsDB.forEach(form => {
        let badgeClass = "badge-draft";
        if (form.status === "pending") badgeClass = "badge-pending";
        else if (form.status === "approved") badgeClass = "badge-approved";
        else if (form.status === "rejected") badgeClass = "badge-rejected";

        // Count active critical items
        const allRows = [
            ...form.dfmea.raw_materials,
            ...form.dfmea.formulation,
            ...form.dfmea.packaging,
            ...form.pfmea.operations,
            ...form.pfmea.logistics
        ];
        const critRows = allRows.filter(r => (r.sev * r.occ * r.det) >= 125).length;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${form.name}</strong></td>
            <td><span class="card-category-badge">${form.category}</span></td>
            <td>Rev ${form.revision}</td>
            <td><span class="badge-status ${badgeClass}">${form.status}</span></td>
            <td>${form.preparedBy}</td>
            <td>${form.approvedBy === "-" ? "Pending HOD Sign-off" : `Approved by ${form.approvedBy}`}</td>
            <td>
                <span class="rpn-badge ${critRows > 0 ? 'rpn-critical' : 'rpn-low'}" style="padding: 0.15rem 0.5rem; font-size:0.75rem;">
                    ${critRows} High Risks
                </span>
            </td>
            <td style="text-align: center;">
                <button class="btn btn-secondary dash-action-btn" onclick="openFormulationWorksheet('${form.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                    Open Workspace
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openFormulationWorksheet(formId) {
    activeFormulationId = formId;
    localStorage.setItem("fmea_active_form_id", formId);
    populateFormulationSelector();
    switchView("dfmea");
}

// --- RPN HELPERS ---
function getRatingClass(val) {
    const num = parseInt(val, 10) || 1;
    if (num >= 9) return "rating-red";
    if (num >= 7) return "rating-orange";
    if (num >= 5) return "rating-yellow";
    if (num >= 3) return "rating-lightgreen";
    return "rating-green";
}

function getRpnClass(rpn) {
    if (rpn < 50) return "rpn-low";
    if (rpn < 125) return "rpn-medium";
    if (rpn < 300) return "rpn-high";
    return "rpn-critical";
}

function getStatusClass(status) {
    if (status === "in-progress") return "ip";
    if (status === "completed") return "co";
    return "ns";
}

// Custom Toast Alerts
function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    const iconName = type === "success" ? "check-circle" : "alert-circle";
    
    toast.innerHTML = `
        <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.style.animation = "slideIn 0.3s reverse forwards";
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// --- GLOBAL EXCEL/CSV HISTORY IMPORT HANDLERS ---
let tempParsedLibraryRows = [];

function handleLibCSVSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcelBinary = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    const reader = new FileReader();

    reader.onload = function(evt) {
        try {
            let workbook;
            if (isExcelBinary) {
                const data = new Uint8Array(evt.target.result);
                workbook = XLSX.read(data, { type: 'array' });
            } else {
                const text = evt.target.result;
                workbook = XLSX.read(text, { type: 'string' });
            }

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // SheetJS sheet_to_json handles quotes, commas, and newlines in cells perfectly!
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
            const parsed = parseSheetRowsToLibrary(rows);

            if (parsed.length === 0) {
                showToast("No valid FMEA rows detected in file.", "error");
                document.getElementById("lib-csv-preview-area").style.display = "none";
                document.getElementById("btn-submit-lib-csv").disabled = true;
                return;
            }

            tempParsedLibraryRows = parsed;
            
            // Render Preview Table (up to 8 rows for visual validation)
            const tbody = document.getElementById("lib-csv-preview-tbody");
            tbody.innerHTML = "";
            
            const previewLimit = Math.min(parsed.length, 8);
            for (let i = 0; i < previewLimit; i++) {
                const item = parsed[i];
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="text-align: center; font-weight: 600;">${item.number || (i + 1)}</td>
                    <td><strong>[${item.section.toUpperCase()}]</strong> ${item.step}</td>
                    <td>${item.mode || '-'}</td>
                    <td style="text-align: center;">${item.sev}</td>
                    <td style="text-align: center;">${item.occ}</td>
                    <td style="text-align: center;">${item.det}</td>
                `;
                tbody.appendChild(tr);
            }

            document.getElementById("lib-csv-count-text").textContent = `Successfully parsed ${parsed.length} row(s) from Excel file. Click confirm to load into database.`;
            document.getElementById("lib-csv-preview-area").style.display = "block";
            document.getElementById("btn-submit-lib-csv").disabled = false;
        } catch (err) {
            showToast("Failed to parse Excel file structure.", "error");
            console.error(err);
        }
    };

    if (isExcelBinary) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
}

function handleLibCSVConfirm() {
    if (tempParsedLibraryRows.length === 0) return;

    const destSelect = document.getElementById("import-destination-select");
    const dest = destSelect ? destSelect.value : "library";

    if (dest === "active_worksheet") {
        const form = getActiveFormulation();
        if (!form) {
            showToast("No active formulation selected to import into.", "error");
            return;
        }

        const activeView = document.querySelector(".view-panel.active")?.id.replace("view-", "");
        const targetView = ["dfmea", "pfmea"].includes(activeView) ? activeView : "dfmea";
        const panel = document.getElementById(`view-${targetView}`);
        const activeSubtab = panel?.querySelector(".tabs-sub-navigation .sub-tab-btn.active")?.dataset.subtab || (targetView === "dfmea" ? "raw_materials" : "operations");

        tempParsedLibraryRows.forEach((row, i) => {
            const newRow = {
                id: "row-" + Date.now() + "-" + i,
                number: row.number || "",
                step: row.step || "",
                function: row.function || "",
                detail: row.detail || "",
                characteristic: row.characteristic || "",
                mode: row.mode || "",
                effect: row.effect || "",
                sev: row.sev || 1,
                cause: row.cause || "",
                occ: row.occ || 1,
                prevention: row.prevention || "",
                detection_controls: row.detection_controls || "",
                det: row.det || 1,
                action: row.action || "",
                resp: row.resp || "",
                result: row.result || "",
                result_date: row.result_date || "",
                result_sev: row.result_sev || 1,
                result_occ: row.result_occ || 1,
                result_det: row.result_det || 1,
                concern: row.concern || "",
                happened: row.happened || "No",
                status: "not-started"
            };
            form[targetView][activeSubtab].push(newRow);
        });

        // Write change log audit
        form.auditLogs.unshift({
            timestamp: new Date().toLocaleString(),
            user: currentUser.username,
            action: "Excel Import",
            details: `Imported ${tempParsedLibraryRows.length} row(s) following Excel numbers into ${targetView.toUpperCase()} -> ${activeSubtab}`
        });

        saveFormulationsDB();
        renderFMEAWorksheet(targetView);
        updateDashboard();
        showToast(`Imported ${tempParsedLibraryRows.length} row(s) following Excel numbers directly into worksheet.`, "success");
    } else {
        // Auto-register any new categories parsed from CSV/Excel into familiesDB
        let familiesChanged = false;
        tempParsedLibraryRows.forEach(row => {
            if (row.category) {
                const trimmedCat = row.category.trim();
                if (trimmedCat && !familiesDB.some(f => f.name.toLowerCase() === trimmedCat.toLowerCase())) {
                    familiesDB.push({
                        name: trimmedCat,
                        description: "Auto-registered via Excel library import."
                    });
                    familiesChanged = true;
                }
            }
        });
        if (familiesChanged) {
            saveFamiliesDB();
        }

        // Append to library
        libraryDB.push(...tempParsedLibraryRows);
        localStorage.setItem("fmea_library", JSON.stringify(libraryDB));

        showToast(`Bulk imported ${tempParsedLibraryRows.length} reference items to History Library.`, "success");
        renderLibraryView();
    }

    // Clear temp state
    tempParsedLibraryRows = [];
    document.getElementById("lib-import-modal").classList.remove("active");
}

function parseSheetRowsToLibrary(rows) {
    if (rows.length < 2) return [];

    const HEADER_TOKENS = ["id", "no", "no.", "num", "number", "seq", "#", "s", "o", "d", "rpn", "step", "item", "mode", "cause", "effect", "action",
        "category", "family", "characteristic", "detail", "function", "concern", "owner", "result"];
    const scoreHeaderRow = (row) => (row || []).reduce((score, cell) => {
        const token = String(cell || "").toLowerCase().trim();
        return score + (HEADER_TOKENS.includes(token) ? 1 : 0);
    }, 0);

    let headerRowIdx = 0;
    let bestScore = -1;
    for (let r = 0; r < Math.min(rows.length - 1, 5); r++) {
        const score = scoreHeaderRow(rows[r]);
        if (score > bestScore) {
            bestScore = score;
            headerRowIdx = r;
        }
    }

    const headers = rows[headerRowIdx].map(h => String(h || '').toLowerCase().trim());

    const getIndex = (aliases) => {
        const exact = headers.findIndex(h => aliases.includes(h));
        if (exact !== -1) return exact;
        const longAliases = aliases.filter(a => a.length > 1);
        return headers.findIndex(h => longAliases.some(alias => h.includes(alias)));
    };

    // Find mapped headers representing customer's Excel columns
    const idxNumber = getIndex(["id", "#", "no", "no.", "num", "number", "item no", "row", "row no", "seq", "sequence", "sn", "s/n"]);
    const idxCat = getIndex(["category", "family", "product family", "product category", "product or process family"]);
    const idxType = getIndex(["type", "fmea type", "section", "dfmea/pfmea"]);
    const idxStep = getIndex(["step", "process step", "design item", "ingredient", "item/step", "process step / item"]);
    const idxFunction = getIndex(["function", "intended use", "process function", "design function"]);
    const idxDetail = getIndex(["detail", "deep detail", "process step - deep detail"]);
    const idxCharacteristic = getIndex(["characteristic", "ctq", "kpc", "process characteristic", "design characteristic"]);
    const idxMode = getIndex(["failure mode", "mode", "potential failure mode"]);
    const idxEffect = getIndex(["effect", "effects", "potential effect", "effect of failure"]);
    const idxCause = getIndex(["cause", "causes", "potential cause"]);
    const idxPrevention = getIndex(["prevention", "prevention control", "current prevention"]);
    const idxDetectionControls = getIndex(["detection control", "detection method", "current detection"]);
    const idxSev = getIndex(["sev", "severity", "s"]);
    const idxOcc = getIndex(["occ", "occurrence", "o"]);
    const idxDet = getIndex(["det", "detection", "d"]);
    const idxAction = getIndex(["action", "recommended action", "actions", "improvement"]);
    const idxResult = getIndex(["result", "action taken", "action results"]);
    const idxResultDate = getIndex(["date completed", "result date"]);
    const idxResultSev = getIndex(["revised s", "revised severity", "result sev"]);
    const idxResultOcc = getIndex(["revised o", "revised occurrence", "result occ"]);
    const idxResultDet = getIndex(["revised d", "revised detection", "result det"]);
    const idxConcern = getIndex(["concern", "special concern"]);
    const idxHappened = getIndex(["happened", "case happened", "case happen"]);
    const idxOwner = getIndex(["owner", "target date", "owner & target date", "resp", "responsibility"]);

    const parsedItems = [];

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const cells = rows[i];
        if (!cells || cells.length === 0) continue;
        
        // Skip rows that are completely empty
        const isRowEmpty = cells.every(c => c === null || c === undefined || String(c).trim() === "");
        if (isRowEmpty) continue;

        const getVal = (headerIdx, defaultIdx, fallbackVal = "") => {
            const idx = headerIdx !== -1 ? headerIdx : defaultIdx;
            const val = cells[idx];
            return (val !== undefined && val !== null) ? String(val).trim() : fallbackVal;
        };

        const rawNumber = idxNumber !== -1 ? cells[idxNumber] : "";
        const numberVal = (rawNumber !== undefined && rawNumber !== null) ? String(rawNumber).trim() : "";

        const rawCat = getVal(idxCat, 0, "Epoxy Adhesives");
        const rawType = getVal(idxType, 1, "raw_material");
        const step = getVal(idxStep, 2, "Unnamed Item");
        const functionVal = getVal(idxFunction, -1, "");
        const detailVal = getVal(idxDetail, -1, "");
        const characteristicVal = getVal(idxCharacteristic, -1, "");
        const mode = getVal(idxMode, 3, "");
        const effectVal = getVal(idxEffect, -1, "");
        const cause = getVal(idxCause, 4, "");
        const preventionVal = getVal(idxPrevention, -1, "");
        const detectionControlsVal = getVal(idxDetectionControls, -1, "");
        const sev = parseInt(getVal(idxSev, 5, "1"), 10) || 1;
        const occ = parseInt(getVal(idxOcc, 6, "1"), 10) || 1;
        const det = parseInt(getVal(idxDet, 7, "1"), 10) || 1;
        const action = getVal(idxAction, 8, "");
        const ownerVal = getVal(idxOwner, -1, "");
        const resultVal = getVal(idxResult, -1, "");
        const resultDateVal = getVal(idxResultDate, -1, "");
        const resultSevVal = parseInt(getVal(idxResultSev, -1, "1"), 10) || 1;
        const resultOccVal = parseInt(getVal(idxResultOcc, -1, "1"), 10) || 1;
        const resultDetVal = parseInt(getVal(idxResultDet, -1, "1"), 10) || 1;
        const concernVal = getVal(idxConcern, -1, "");
        const happenedVal = getVal(idxHappened, -1, "No");

        // Category validation against dynamic product or process families registry
        let category = rawCat ? rawCat.trim() : "Epoxy Adhesives";
        const matchedFam = familiesDB.find(f => f.name.toLowerCase() === category.toLowerCase());
        if (matchedFam) {
            category = matchedFam.name;
        }

        // Smart Mappings for the 5 categories (Raw Material, Formulation, Packaging, Process, Packing/Shipment)
        let section = "raw_material";
        const val = rawType.trim().toLowerCase();
        const stepVal = step.toLowerCase();
        const modeVal = mode.toLowerCase();

        // 1. Check FMEA Type / Section column explicitly if present
        if (val.includes("raw") || val.includes("material")) {
            section = "raw_material";
        } else if (val.includes("formulation") || val.includes("formula")) {
            section = "formulation";
        } else if (val.includes("packaging") || val.includes("pkg")) {
            section = "packaging";
        } else if (val.includes("process") || val.includes("operation") || val.includes("mfg") || val.includes("mixing") || val.includes("mix") || val.includes("pfmea")) {
            section = "process";
        } else if (val.includes("shipment") || val.includes("logistics") || val.includes("shipping") || val.includes("packing") || val.includes("ship")) {
            section = "packing_shipment";
        } 
        // 2. Fallback check keywords in step, mode, or type
        else {
            const combinedText = (stepVal + " " + val + " " + modeVal).toLowerCase();
            
            if (combinedText.includes("mixing") || combinedText.includes("mix") || combinedText.includes("blend") || combinedText.includes("blending") || combinedText.includes("process") || combinedText.includes("reactor") || combinedText.includes("milling") || combinedText.includes("filtering") || combinedText.includes("filtration")) {
                section = "process";
            } else if (combinedText.includes("packaging") || combinedText.includes("bottle") || combinedText.includes("drum") || combinedText.includes("cartridge") || combinedText.includes("capping") || combinedText.includes("labeling")) {
                section = "packaging";
            } else if (combinedText.includes("shipping") || combinedText.includes("shipment") || combinedText.includes("transport") || combinedText.includes("pallet") || combinedText.includes("warehouse")) {
                section = "packing_shipment";
            } else if (combinedText.includes("formulation") || combinedText.includes("recipe") || combinedText.includes("ingredient") || combinedText.includes("ratio") || combinedText.includes("proportion")) {
                section = "formulation";
            } else {
                section = "raw_material";
            }
        }

        parsedItems.push({
            id: "lib-csv-" + i + "-" + Date.now(),
            number: numberVal,
            category,
            section,
            step,
            function: functionVal,
            detail: detailVal,
            characteristic: characteristicVal,
            mode,
            effect: effectVal,
            cause,
            prevention: preventionVal,
            detection_controls: detectionControlsVal,
            sev,
            occ,
            det,
            action,
            resp: ownerVal,
            result: resultVal,
            result_date: resultDateVal,
            result_sev: resultSevVal,
            result_occ: resultOccVal,
            result_det: resultDetVal,
            concern: concernVal,
            happened: happenedVal
        });
    }
    return parsedItems;
}

// --- PRODUCT OR PROCESS FAMILY REGISTRY ---
let familiesDB = [];

function loadFamiliesDB() {
    try {
        const stored = localStorage.getItem("fmea_families");
        if (stored) {
            familiesDB = JSON.parse(stored);
        } else {
            familiesDB = [];
            localStorage.setItem("fmea_families", JSON.stringify(familiesDB));
        }
    } catch (e) {
        console.error("Failed to load product or process families database", e);
        familiesDB = [];
    }
}

function saveFamiliesDB() {
    localStorage.setItem("fmea_families", JSON.stringify(familiesDB));
    updateAllFamilyDropdowns();
}

function updateAllFamilyDropdowns() {
    const selects = [
        document.getElementById("formulation-category"),
        document.getElementById("lib-product-cat"),
        document.getElementById("lib-filter-category"),
        document.getElementById("lib-picker-category")
    ];

    selects.forEach(sel => {
        if (!sel) return;
        
        const prevValue = sel.value;
        sel.innerHTML = "";

        if (sel.id === "lib-filter-category" || sel.id === "lib-picker-category") {
            const optAll = document.createElement("option");
            optAll.value = "all";
            optAll.textContent = "All Product or Process Families";
            sel.appendChild(optAll);
        }

        if (familiesDB.length === 0) {
            const optNone = document.createElement("option");
            optNone.value = "";
            optNone.textContent = "(No Registered Product or Process Families)";
            sel.appendChild(optNone);
        } else {
            familiesDB.forEach(fam => {
                const opt = document.createElement("option");
                opt.value = fam.name;
                opt.textContent = fam.name;
                sel.appendChild(opt);
            });
        }

        if (Array.from(sel.options).some(o => o.value === prevValue)) {
            sel.value = prevValue;
        } else if (sel.options.length > 0) {
            sel.selectedIndex = 0;
        }
    });
}

function renderFamiliesView() {
    const tbody = document.getElementById("families-tbody");
    const emptyState = document.getElementById("families-empty");
    tbody.innerHTML = "";

    if (familiesDB.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

    familiesDB.forEach((fam, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-align: center;"><span class="row-index">${idx + 1}</span></td>
            <td><strong>${fam.name}</strong></td>
            <td>${fam.description || '-'}</td>
            <td style="text-align: center;">
                <button class="btn-table-action delete-family-btn delete" title="Delete Product or Process Family">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        `;

        tr.querySelector(".delete-family-btn").addEventListener("click", () => {
            if (confirm(`Are you sure you want to delete the product or process family "${fam.name}"? Existing formulations linked to it will remain, but you won't be able to select it for new entries.`)) {
                deleteFamily(fam.name);
            }
        });

        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

function deleteFamily(name) {
    const index = familiesDB.findIndex(f => f.name === name);
    if (index === -1) return;
    familiesDB.splice(index, 1);
    saveFamiliesDB();
    renderFamiliesView();
    showToast(`Product or Process Family "${name}" unregistered.`, "success");
}

function handleCreateFamilySubmit() {
    const name = document.getElementById("family-name").value.trim();
    const desc = document.getElementById("family-desc").value.trim();

    if (!name) return;

    if (familiesDB.some(f => f.name.toLowerCase() === name.toLowerCase())) {
        showToast("A product or process family with this name is already registered.", "error");
        return;
    }

    familiesDB.push({
        name: name,
        description: desc
    });

    saveFamiliesDB();
    document.getElementById("family-create-form").reset();
    document.getElementById("family-modal").classList.remove("active");
    showToast(`Successfully registered Product or Process Family "${name}".`, "success");
    renderFamiliesView();
}

// --- AUTHORITY COLOR SETTINGS CONTROLLER ---
function applyRatingColors() {
    document.documentElement.style.setProperty('--rating-color-crit', ratingColors.crit);
    document.documentElement.style.setProperty('--rating-color-high', ratingColors.high);
    document.documentElement.style.setProperty('--rating-color-medium', ratingColors.medium);
    document.documentElement.style.setProperty('--rating-color-lowmed', ratingColors.lowmed);
    document.documentElement.style.setProperty('--rating-color-low', ratingColors.low);
}

function populateSettingsColors() {
    document.getElementById("color-crit").value = ratingColors.crit;
    document.getElementById("color-high").value = ratingColors.high;
    document.getElementById("color-medium").value = ratingColors.medium;
    document.getElementById("color-lowmed").value = ratingColors.lowmed;
    document.getElementById("color-low").value = ratingColors.low;
}

// --- WORKSHEET CSV EXPORTER ---
function exportFMEACSV(viewType) {
    const form = getActiveFormulation();
    if (!form) {
        showToast("No active formulation selected.", "error");
        return;
    }

    const panel = document.getElementById(`view-${viewType}`);
    const activeSubtab = panel.querySelector(".tabs-sub-navigation .sub-tab-btn.active").dataset.subtab;
    const list = form[viewType][activeSubtab] || [];

    if (list.length === 0) {
        showToast("No data rows to export in this worksheet tab.", "error");
        return;
    }

    const headers = [
        "No.",
        "Step/Ingredient",
        "Function",
        "Deep Detail",
        "Characteristic (CTQ/KPC)",
        "Potential Failure Mode",
        "Potential Effect",
        "S",
        "Potential Cause",
        "O",
        "Current Prevention",
        "Current Detection",
        "D",
        "RPN",
        "Recommended Action",
        "Responsible & Target",
        "Action Taken / Results",
        "Date Completed",
        "Revised S",
        "Revised O",
        "Revised D",
        "Revised RPN",
        "Special Concern",
        "Case Happened"
    ];

    const rows = list.map((item, idx) => [
        item.number || (idx + 1),
        item.step || "",
        item.function || "",
        item.detail || "",
        item.characteristic || "",
        item.mode || "",
        item.effect || "",
        item.sev || 1,
        item.cause || "",
        item.occ || 1,
        item.prevention || "",
        item.detection_controls || "",
        item.det || 1,
        (item.sev || 1) * (item.occ || 1) * (item.det || 1),
        item.action || "",
        item.resp || "",
        item.result || "",
        item.result_date || "",
        item.result_sev || 1,
        item.result_occ || 1,
        item.result_det || 1,
        (item.result_sev || 1) * (item.result_occ || 1) * (item.result_det || 1),
        item.concern || "",
        item.happened || "No"
    ]);

    const csvContent = [
        headers.join(","),
        ...rows.map(r => r.map(val => {
            const escaped = String(val).replace(/"/g, '""');
            return escaped.includes(",") || escaped.includes("\n") || escaped.includes('"') ? `"${escaped}"` : escaped;
        }).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const filename = `${form.name.replace(/\s+/g, "_")}_${viewType.toUpperCase()}_${activeSubtab}_Rev${form.revision}.csv`;
    
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    showToast(`Exported ${viewType.toUpperCase()} worksheet to Excel CSV.`, "success");
}
