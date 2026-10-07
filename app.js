// Adhesive manufacturing FMEA application logic

// State Management
let currentUser = null;
let activeFormulationId = null;
let isFMEAUnlocked = true;
let pendingTargetView = null;

// Databases (stored in localStorage)
let usersDB = [];
let formulationsDB = [];
let libraryDB = [];
let scanHistoryDB = JSON.parse(localStorage.getItem("fmea_scan_history")) || [];
let currentCSVFileName = "";

// Authority Configurable Rating Colors state - Gentle Harmonic Palette
const defaultRatingColors = {
    crit: "#ea6c75",
    high: "#f49352",
    medium: "#f6c453",
    lowmed: "#8cdab2",
    low: "#48bb78"
};

// Gentle Pastel alternative palette
const pastelRatingColors = {
    crit: "#fca5a5",
    high: "#fdba74",
    medium: "#fde047",
    lowmed: "#a7f3d0",
    low: "#86efac"
};

let savedColors = null;
try {
    savedColors = JSON.parse(localStorage.getItem("fmea_rating_colors"));
} catch (e) {}

// Auto-migrate if previous storage had the harsh neon defaults
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

    // Enable drag-and-drop reordering for sidebar navigation items
    initSidebarDragAndDrop();

    // Restore persistent sidebar collapsed state & scroll position
    const isSidebarCollapsed = localStorage.getItem("fmea_sidebar_collapsed") === "true";
    const sidebar = document.querySelector("aside.app-sidebar");
    if (sidebar && isSidebarCollapsed) {
        sidebar.classList.add("collapsed");
    }

    const sidebarNav = document.querySelector(".sidebar-nav");
    if (sidebarNav) {
        const savedScroll = localStorage.getItem("fmea_sidebar_scroll_top");
        if (savedScroll !== null) {
            sidebarNav.scrollTop = parseInt(savedScroll, 10);
        }
        sidebarNav.addEventListener("scroll", () => {
            localStorage.setItem("fmea_sidebar_scroll_top", sidebarNav.scrollTop);
        });
    }

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
        if (wrapper.closest("#view-audit") || wrapper.classList.contains("no-hscroll-mirror") || wrapper.dataset.noHscroll) return;
        const table = wrapper.querySelector("table");
        if (!table || wrapper.dataset.hscrollMirrored) return;
        wrapper.dataset.hscrollMirrored = "true";

        const mirror = document.createElement("div");
        mirror.className = "hscroll-mirror";
        const mirrorInner = document.createElement("div");
        mirrorInner.className = "hscroll-mirror-inner";
        mirror.appendChild(mirrorInner);
        wrapper.parentNode.insertBefore(mirror, wrapper);

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
        const defaultUsers = [
            { username: "jack", email: "jack@penchem.com", role: "operator", password: "123" },
            { username: "seokfern", email: "seokfern@penchem.com", role: "operator", password: "123" },
            { username: "operator", email: "operator@penchem.com", role: "operator", password: "123" },
            { username: "hod", email: "hod@penchem.com", role: "hod", password: "123" }
        ];

        let storedUsers = JSON.parse(localStorage.getItem("fmea_users"));
        if (!storedUsers || !Array.isArray(storedUsers) || storedUsers.length === 0) {
            usersDB = [...defaultUsers];
            localStorage.setItem("fmea_users", JSON.stringify(usersDB));
        } else {
            usersDB = storedUsers;
        }

        formulationsDB = JSON.parse(localStorage.getItem("fmea_formulations")) || [];
        if (!Array.isArray(formulationsDB) || formulationsDB.length === 0) {
            formulationsDB = [
                {
                    id: "form-default-ag803",
                    name: "AG803 Die Attach Conductive Adhesive",
                    category: "Epoxy Adhesives",
                    description: "High thermal conductivity silver-filled epoxy adhesive for microelectronics & semiconductor die attach.",
                    revision: "1.0",
                    status: "draft",
                    preparedBy: "jack",
                    approvedBy: "-",
                    approvalDate: "-",
                    rejectionComment: "-",
                    changeReason: "Initial baseline master project formulation.",
                    dfmea: {
                        raw_materials: [
                            {
                                id: "row-rm-1",
                                number: "1",
                                step: "KER-828",
                                function: "Base Epoxy Resin Binder",
                                detail: "Liquid Bisphenol-A Epoxy Resin (EEW 184-190 g/eq).",
                                characteristic: "CTQ Viscosity",
                                mode: "High moisture contamination causing viscosity drift",
                                effect: "Voiding under die attach and reduced mechanical bond strength",
                                sev: 8,
                                cause: "Storage drum seal leakage during warehouse humidity exposure",
                                occ: 3,
                                prevention: "Dry nitrogen purging and desiccated storage drum caps",
                                detection_controls: "Incoming Karl Fischer moisture titration (max 0.05%)",
                                det: 3,
                                action: "Automate moisture interlock on dispensing manifold",
                                resp: "QC / Jack",
                                result: "Implemented automated KF check protocol",
                                result_date: "2026-03-15",
                                result_sev: 8,
                                result_occ: 2,
                                result_det: 2,
                                concern: "High humidity monsoon season",
                                happened: "No"
                            }
                        ],
                        formulation: [
                            {
                                id: "row-form-1",
                                number: "1",
                                step: "AG803",
                                function: "Die Attach Electrical & Thermal Conduction",
                                detail: "Silver-filled conductive paste for IC die attach and LED packaging.",
                                characteristic: "CTQ Thermal Conductivity",
                                mode: "Silver agglomeration / uneven paste dispersion",
                                effect: "Hotspot failure in power device, high electrical resistance",
                                sev: 9,
                                cause: "Insufficient planetary mixing speed or mixing time under vacuum",
                                occ: 3,
                                prevention: "Standardized dual-asymmetric centrifugal mixing cycle",
                                detection_controls: "Four-point probe electrical volume resistivity test",
                                det: 2,
                                action: "Install PLC timer and RPM tachometer lock on planetary mixer",
                                resp: "Production / Jack",
                                result: "Mixer interlock validated with 100% compliance",
                                result_date: "2026-03-20",
                                result_sev: 9,
                                result_occ: 2,
                                result_det: 2,
                                concern: "AEC-Q100 grade 0 semiconductor specs",
                                happened: "No"
                            }
                        ],
                        application: [
                            {
                                id: "row-app-1",
                                number: "1",
                                step: "APP-AUTO-001",
                                function: "Automotive Sensor & Substrate Assembly",
                                detail: "Automotive Radar & Lidar Sensors (Low voiding & thermal shock -40°C to 150°C).",
                                characteristic: "CTQ Thermal Shock Adhesion",
                                mode: "Delamination under temperature cycling (-40°C to 150°C)",
                                effect: "Sensor signal drift or intermittent disconnect in vehicle",
                                sev: 8,
                                cause: "CTE mismatch between silicon die and copper leadframe substrate",
                                occ: 3,
                                prevention: "Flexibilized epoxy backbone formulation with low modulus",
                                detection_controls: "Scanning Acoustic Microscopy (C-SAM) acoustic void check",
                                det: 3,
                                action: "Perform 1000 hrs thermal shock test qualification",
                                resp: "R&D / Seok Fern",
                                result: "Passed 1000 cyc thermal shock with 0% delamination",
                                result_date: "2026-03-25",
                                result_sev: 8,
                                result_occ: 2,
                                result_det: 2,
                                concern: "Automotive IATF 16949 reliability requirement",
                                happened: "No"
                            }
                        ],
                        packaging: [
                            {
                                id: "row-pkg-1",
                                number: "1",
                                step: "PKG-SYR-0030",
                                function: "Dispensing Containment & Protection",
                                detail: "30cc EFD Nordson Black Syringe (Air-free centrifugal deaeration).",
                                characteristic: "CTQ Bubble Void Elimination",
                                mode: "Micro-air bubbles entrapped in syringe piston seal",
                                effect: "Dispensing voids and dot size inconsistency during SMT assembly",
                                sev: 7,
                                cause: "Syringe filling under ambient pressure without vacuum centrifugation",
                                occ: 4,
                                prevention: "Centrifugal vacuum deaeration at 2000 RPM for 3 minutes",
                                detection_controls: "Optical high-resolution camera bubble inspection",
                                det: 2,
                                action: "Automated syringe vacuum packaging line station",
                                resp: "Packaging / Jack",
                                result: "Centrifugal deaeration verified void-free",
                                result_date: "2026-03-18",
                                result_sev: 7,
                                result_occ: 2,
                                result_det: 2,
                                concern: "Cleanroom Class 1000 packaging standard",
                                happened: "No"
                            }
                        ]
                    },
                    pfmea: {
                        operations: [
                            {
                                id: "row-proc-1",
                                number: "1",
                                step: "PROC-EP-001",
                                function: "Planetary Mixing & Vacuum Degassing",
                                detail: "High-shear planetary mixing, -0.098MPa vacuum degassing, & automated syringe filling.",
                                characteristic: "CTQ Degree of Degassing",
                                mode: "Vacuum leak during degassing stage (pressure rises above -0.095MPa)",
                                effect: "Entrained micro air bubbles remaining in adhesive batch",
                                sev: 8,
                                cause: "Vacuum chamber O-ring wear or valve particulate clogging",
                                occ: 3,
                                prevention: "Daily vacuum pressure decay leak-rate check",
                                detection_controls: "Digital Pirani vacuum gauge with PLC threshold cut-off",
                                det: 2,
                                action: "Implement preventive O-ring replacement schedule every 500 batches",
                                resp: "Maintenance / Jack",
                                result: "Automated vacuum cut-off active on mixer",
                                result_date: "2026-03-22",
                                result_sev: 8,
                                result_occ: 2,
                                result_det: 2,
                                concern: "Safety interlock compliance",
                                happened: "No"
                            }
                        ],
                        logistics: [
                            {
                                id: "row-log-1",
                                number: "1",
                                step: "Cold Chain -40°C Transport",
                                function: "Preserve Chemical Shelf Life During Freight",
                                detail: "Dry ice insulated shipper box with digital USB temperature datalogger.",
                                characteristic: "CTQ Temperature Stability",
                                mode: "Temperature excursion above -20°C during transit delay",
                                effect: "Premature curing / polymerization and viscosity increase",
                                sev: 8,
                                cause: "Courier logistics flight delay or dry ice sublimation",
                                occ: 3,
                                prevention: "Standard 72-hour validated VIP insulated shipping container",
                                detection_controls: "Cold-chain USB datalogger download and verification upon arrival",
                                det: 2,
                                action: "Real-time cellular GPS / temperature sensor tag inside shippers",
                                resp: "Logistics Team",
                                result: "Validated 96-hour cold retention under extreme summer profile",
                                result_date: "2026-03-25",
                                result_sev: 8,
                                result_occ: 2,
                                result_det: 2,
                                concern: "Cross-border customs delays",
                                happened: "No"
                            }
                        ]
                    },
                    controlPlan: [],
                    auditLogs: [
                        {
                            timestamp: new Date().toLocaleString(),
                            user: "jack (operator)",
                            action: "Document Initialized",
                            details: "Initial baseline AG803 master formulation project loaded."
                        }
                    ],
                    revisionHistory: []
                }
            ];
            localStorage.setItem("fmea_formulations", JSON.stringify(formulationsDB));
        }
        
        // Backfill new fields on existing formulations to prevent undefined references
        let needsFormulationsSave = false;
        formulationsDB.forEach(form => {
            if (form.dfmea) {
                if (!form.dfmea.raw_materials) form.dfmea.raw_materials = [];
                if (!form.dfmea.formulation) form.dfmea.formulation = [];
                if (!form.dfmea.application) form.dfmea.application = [];
                if (!form.dfmea.packaging) form.dfmea.packaging = [];
            }
            if (form.pfmea) {
                if (!form.pfmea.operations) form.pfmea.operations = [];
                if (!form.pfmea.logistics) form.pfmea.logistics = [];
            }
            const tabsDFMEA = ["raw_materials", "formulation", "application", "packaging"];
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
                        if (!row.result_sev) { row.result_sev = row.sev || 1; needsFormulationsSave = true; }
                        if (!row.result_occ) { row.result_occ = row.occ || 1; needsFormulationsSave = true; }
                        if (!row.result_det) { row.result_det = row.det || 1; needsFormulationsSave = true; }
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
                        if (!row.result_sev) { row.result_sev = row.sev || 1; needsFormulationsSave = true; }
                        if (!row.result_occ) { row.result_occ = row.occ || 1; needsFormulationsSave = true; }
                        if (!row.result_det) { row.result_det = row.det || 1; needsFormulationsSave = true; }
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
            if (!Array.isArray(libraryDB) || libraryDB.length === 0) {
                libraryDB = JSON.parse(JSON.stringify(defaultLibrary));
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
                if (!item.result_sev) { item.result_sev = item.sev || 1; needsMigrationSave = true; }
                if (!item.result_occ) { item.result_occ = item.occ || 1; needsMigrationSave = true; }
                if (!item.result_det) { item.result_det = item.det || 1; needsMigrationSave = true; }
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

        // Immediately synchronize all Master Data items into the History Library on startup
        if (typeof syncMasterDataToHistoryLibrary === "function") {
            syncMasterDataToHistoryLibrary();
        }
    } catch (e) {
        console.error("Storage load failure, resetting local databases...", e);
        usersDB = [];
        formulationsDB = [];
        libraryDB = [];
    }
}

// Team Synchronization Hook: reload databases from localStorage and refresh UI
window.reloadAllFromStorage = function() {
    loadAllDatabases();
    if (activeFormulationId && formulationsDB.some(f => f.id === activeFormulationId)) {
        // active formulation retained
    } else if (formulationsDB.length > 0) {
        activeFormulationId = formulationsDB[0].id;
    }

    const activeElem = document.activeElement;
    const isUserTyping = activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA' || activeElem.isContentEditable);
    if (!isUserTyping && currentUser) {
        const activeView = document.querySelector(".view-panel.active");
        const viewId = activeView ? activeView.id.replace("view-", "") : "dashboard";
        if (viewId === "formulation-details") {
            if (typeof renderSpreadsheet === "function") renderSpreadsheet();
            if (typeof renderWorkflowStatus === "function") renderWorkflowStatus();
        } else if (viewId === "dashboard") {
            if (typeof renderDashboardMetrics === "function") renderDashboardMetrics();
            if (typeof renderFormulationsList === "function") renderFormulationsList();
        } else if (viewId === "library") {
            if (typeof renderLibraryTable === "function") renderLibraryTable();
        } else if (viewId === "master-data") {
            if (typeof renderMasterDataLists === "function") renderMasterDataLists();
        }
    }
};

// Session Validation
function checkActiveSession() {
    applyRatingColors();
    restoreSidebarCollapsedState();
    const session = localStorage.getItem("fmea_session_user");
    if (session) {
        currentUser = JSON.parse(session);
        document.getElementById("auth-screen").style.display = "none";
        
        // Populate profile card info
        document.getElementById("display-username").textContent = currentUser.username;
        let roleDisplay = (currentUser.role || "user").toUpperCase();
        if (currentUser.role === "hod") roleDisplay = "HOD REVIEWER";
        document.getElementById("display-role").textContent = roleDisplay;
        document.getElementById("avatar-initials").textContent = currentUser.username.substring(0, 1).toUpperCase();
        
        // HOD view configurations
        if (currentUser.role === "hod") {
            document.getElementById("hod-pending-alert").style.display = "flex";
        } else {
            document.getElementById("hod-pending-alert").style.display = "none";
        }

        // Initialize sidebar drag & drop for Operator
        initSidebarDragAndDrop();

        // Hydrate dropdown
        updateAllFamilyDropdowns();
        populateFormulationSelector();
        
        // Dashboard reload
        updateDashboard();

        // Ensure FMEA toggle button visibility is strictly restricted to DFMEA and PFMEA only
        const activePanel = document.querySelector(".view-panel.active");
        const activeView = activePanel ? activePanel.id.replace("view-", "") : "";
        document.body.classList.remove("view-mode-dfmea", "view-mode-pfmea");
        if (activeView === "dfmea" || activeView === "pfmea") {
            document.body.classList.add(`view-mode-${activeView}`);
        }
        const toggleFMEABtn = document.getElementById("btn-toggle-fmea-view");
        if (toggleFMEABtn) {
            if (activeView === "dfmea" || activeView === "pfmea") {
                toggleFMEABtn.style.setProperty("display", "inline-flex", "important");
            } else {
                toggleFMEABtn.style.setProperty("display", "none", "important");
            }
        }
    } else {
        document.getElementById("auth-screen").style.display = "flex";
    }
}

// --- CONTROLLER EVENT BINDINGS ---
function attachAppEventListeners() {
    // Auth Toggles
    const goToReg = document.getElementById("go-to-register");
    if (goToReg) {
        goToReg.addEventListener("click", (e) => {
            e.preventDefault();
            const loginCard = document.getElementById("login-card");
            const regCard = document.getElementById("register-card");
            if (loginCard) loginCard.style.display = "none";
            if (regCard) regCard.style.display = "block";
        });
    }
    
    const goToLog = document.getElementById("go-to-login");
    if (goToLog) {
        goToLog.addEventListener("click", (e) => {
            e.preventDefault();
            const loginCard = document.getElementById("login-card");
            const regCard = document.getElementById("register-card");
            if (regCard) regCard.style.display = "none";
            if (loginCard) loginCard.style.display = "block";
        });
    }

    // Auth Form Submits
    const loginForm = document.getElementById("login-form");
    if (loginForm) loginForm.addEventListener("submit", handleLogin);
    const regForm = document.getElementById("register-form");
    if (regForm) regForm.addEventListener("submit", handleRegister);
    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) btnLogout.addEventListener("click", handleLogout);
    const authForm = document.getElementById("fmea-auth-form");
    if (authForm) authForm.addEventListener("submit", handleFMEAAuthSubmit);

    // Real-Time Activity History Drawer listeners
    const btnToggleActivity = document.getElementById("btn-toggle-activity-bar");
    const drawerActivity = document.getElementById("activity-history-drawer");
    const btnCloseActivity = document.getElementById("btn-close-activity-drawer");
    const btnClearActivity = document.getElementById("btn-clear-activity-logs");
    const searchActivityInput = document.getElementById("activity-search-input");

    if (btnToggleActivity && drawerActivity) {
        btnToggleActivity.addEventListener("click", () => {
            drawerActivity.classList.toggle("active");
            if (drawerActivity.classList.contains("active")) {
                renderGlobalActivityLogs();
            }
        });
    }

    if (btnCloseActivity && drawerActivity) {
        btnCloseActivity.addEventListener("click", () => {
            drawerActivity.classList.remove("active");
        });
    }

    if (btnClearActivity) {
        btnClearActivity.addEventListener("click", () => {
            if (confirm("Are you sure you want to clear all operation history logs?")) {
                localStorage.setItem("fmea_global_activity_log", JSON.stringify([]));
                renderGlobalActivityLogs();
                showToast("Operation history log cleared.", "success");
            }
        });
    }

    const btnPageActivity = document.getElementById("btn-open-activity-bar-from-page");
    if (btnPageActivity && drawerActivity) {
        btnPageActivity.addEventListener("click", () => {
            drawerActivity.classList.add("active");
            renderGlobalActivityLogs();
        });
    }

    const btnAuditActivity = document.getElementById("btn-open-activity-bar-from-audit-page");
    if (btnAuditActivity && drawerActivity) {
        btnAuditActivity.addEventListener("click", () => {
            drawerActivity.classList.add("active");
            renderGlobalActivityLogs();
        });
    }

    if (searchActivityInput) {
        searchActivityInput.addEventListener("input", () => {
            renderGlobalActivityLogs();
        });
    }

    // Sidebar navigation tabs router (Event Delegation)
    const sidebarNavContainer = document.querySelector(".sidebar-nav");
    if (sidebarNavContainer) {
        sidebarNavContainer.addEventListener("click", (e) => {
            const navItem = e.target.closest(".nav-item");
            if (!navItem) return;

            // Allow default navigation for anchor links (e.g., Central Database, HOD Review)
            if (navItem.tagName === "A" && navItem.getAttribute("href")) {
                return;
            }

            // If an actual drag reorder just completed, skip view switching
            if (navItem.dataset.wasDragged === "true") {
                delete navItem.dataset.wasDragged;
                return;
            }

            const targetView = navItem.dataset.view;
            if (targetView) {
                e.preventDefault();
                switchView(targetView);
            }
        });
    }

    // Active Formulation selector dropdown
    document.getElementById("active-formulation-select").addEventListener("change", (e) => {
        activeFormulationId = e.target.value;
        localStorage.setItem("fmea_active_form_id", activeFormulationId);
        
        const selForm = formulationsDB.find(f => f.id === activeFormulationId);
        if (selForm) {
            logGlobalActivity("Selected Formulation", "Formulations", `Switched active project to "${selForm.name}" (${selForm.category}).`);
        }

        // Refresh active views
        const currentView = document.querySelector(".view-panel.active").id.replace("view-", "");
        switchView(currentView);
    });

    // Sidebar collapse button is handled via onclick attribute in index.html to avoid duplicate double-firing

    // Theme Switch
    const themeToggleBtn = document.getElementById("theme-toggle");
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", () => {
            const theme = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
            document.documentElement.setAttribute("data-theme", theme);
            localStorage.setItem("theme", theme);
            logGlobalActivity("Toggled Workspace Theme", "Settings", `Switched interface visual theme to ${theme.toUpperCase()} mode.`);
            showToast(`Theme changed to ${theme}.`, "success");
        });
    }
    
    // Help Rating Guidelines Sidebar Drawer (toggleRatingGuide is defined globally below)
    
    const sidebarHandleBtn = document.getElementById("sidebar-handle");
    if (sidebarHandleBtn) {
        sidebarHandleBtn.addEventListener("click", () => {
            const refSidebar = document.getElementById("reference-sidebar");
            if (!refSidebar) return;
            const isCollapsed = refSidebar.classList.toggle("collapsed");
            const handle = document.getElementById("sidebar-handle");
            const handleIcon = document.getElementById("handle-icon");
            if (isCollapsed) {
                if (handleIcon) handleIcon.setAttribute("data-lucide", "chevron-left");
                if (handle) handle.style.right = "0";
            } else {
                if (handleIcon) handleIcon.setAttribute("data-lucide", "chevron-right");
                if (handle) handle.style.right = "320px";
            }
            if (window.lucide) window.lucide.createIcons();
        });
    }

    // Modals generic close button delegation & backdrop click handler
    document.addEventListener("click", (e) => {
        const closeBtn = e.target.closest(".btn-close-modal, .modal-close-btn, [data-modal-close]");
        if (closeBtn) {
            e.preventDefault();
            const modal = closeBtn.closest(".modal-overlay");
            if (modal) {
                closeModal(modal);
            }
        }
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
    const dfSearch = document.getElementById("dfmea-search");
    if (dfSearch) {
        dfSearch.addEventListener("input", filterAndRenderFMEA);
        dfSearch.addEventListener("search", filterAndRenderFMEA);
    }
    const pfSearch = document.getElementById("pfmea-search");
    if (pfSearch) {
        pfSearch.addEventListener("input", filterAndRenderFMEA);
        pfSearch.addEventListener("search", filterAndRenderFMEA);
    }

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
            const section = activeBtn ? activeBtn.dataset.section : "formulation";
            let subtab = "formulation";
            if (section === "raw_material" || section === "raw_materials") subtab = "raw_materials";
            else if (section === "application") subtab = "application";
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
            const subtab = section === "packing_shipment" || section === "logistics" ? "logistics" : "operations";
            const subtabBtn = document.querySelector(`#view-pfmea .tabs-sub-navigation .sub-tab-btn[data-subtab="${subtab}"]`);
            if (subtabBtn) subtabBtn.click();
        });
    }

    const btnDFMEAOpenLib = document.getElementById("btn-dfmea-open-library");
    if (btnDFMEAOpenLib) {
        btnDFMEAOpenLib.addEventListener("click", () => {
            const activeSubtab = document.querySelector("#view-dfmea .tabs-sub-navigation .sub-tab-btn.active")?.dataset.subtab || "formulation";
            let targetSection = "formulation";
            if (activeSubtab === "raw_materials") targetSection = "raw_material";
            else if (activeSubtab === "application") targetSection = "application";
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

    const btnScanHistOpenLib = document.getElementById("btn-open-lib-from-scan-history-page");
    if (btnScanHistOpenLib) {
        btnScanHistOpenLib.addEventListener("click", () => {
            switchView("library");
        });
    }

    // Drag-down Single Action Select Bar Handler
    const selLibActions = document.getElementById("select-library-actions");
    if (selLibActions) {
        selLibActions.addEventListener("change", (e) => {
            const val = e.target.value;
            if (!val) return;
            if (val === "dfmea") {
                switchView("dfmea");
            } else if (val === "pfmea") {
                switchView("pfmea");
            } else if (val === "history_log") {
                document.getElementById("btn-open-scan-history-modal")?.click();
            } else if (val === "import_csv") {
                openImportModal("library");
            } else if (val === "restore_defaults") {
                document.getElementById("btn-restore-library-defaults")?.click();
            } else if (val === "clear_library") {
                document.getElementById("btn-clear-library")?.click();
            }
            e.target.value = "";
        });
    }

    // Drag-down Single Action Select Bar Handlers for DFMEA & PFMEA
    const selDFMEAActions = document.getElementById("select-dfmea-actions");
    if (selDFMEAActions) {
        selDFMEAActions.addEventListener("change", (e) => {
            const val = e.target.value;
            if (!val) return;
            if (val === "sync_ctq") {
                openFMEAInterlinkSyncModal("dfmea_to_pfmea");
            } else if (val === "master_data") {
                navigateToMasterData("flow");
            } else if (val === "history_library") {
                document.getElementById("btn-dfmea-open-library")?.click();
            } else if (val === "import_excel") {
                openImportModal("active_worksheet");
            } else if (val === "export_excel") {
                exportFMEACSV("dfmea");
            } else if (val === "export_pdf") {
                window.print();
            } else if (val === "import_history") {
                document.querySelector("#view-dfmea .btn-toggle-picker")?.click();
            }
            e.target.value = "";
        });
    }

    const selPFMEAActions = document.getElementById("select-pfmea-actions");
    if (selPFMEAActions) {
        selPFMEAActions.addEventListener("change", (e) => {
            const val = e.target.value;
            if (!val) return;
            if (val === "sync_ctq") {
                openFMEAInterlinkSyncModal("pfmea_to_dfmea");
            } else if (val === "master_data") {
                navigateToMasterData("proc");
            } else if (val === "history_library") {
                document.getElementById("btn-pfmea-open-library")?.click();
            } else if (val === "import_excel") {
                openImportModal("active_worksheet");
            } else if (val === "export_excel") {
                exportFMEACSV("pfmea");
            } else if (val === "export_pdf") {
                window.print();
            } else if (val === "import_history") {
                document.querySelector("#view-pfmea .btn-toggle-picker")?.click();
            }
            e.target.value = "";
        });
    }


    // CSV / Excel Import modal triggers
    const openImportModal = (defaultDest = "library") => {
        document.getElementById("lib-csv-file-input").value = "";
        document.getElementById("lib-csv-preview-area").style.display = "none";
        document.getElementById("btn-submit-lib-csv").disabled = true;
        const destSelect = document.getElementById("import-destination-select");
        if (destSelect) destSelect.value = defaultDest;
        const modal = document.getElementById("lib-import-modal");
        if (modal) {
            modal.style.display = "";
            modal.classList.add("active");
        }
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
    const btnAddFam = document.getElementById("btn-add-family");
    if (btnAddFam) {
        btnAddFam.addEventListener("click", () => {
            openCreateFamilyModal('product');
        });
    }
    const familyForm = document.getElementById("family-create-form");
    if (familyForm) {
        familyForm.addEventListener("submit", handleCreateFamilySubmit);
    }

    // Color Settings actions
    const btnResetColors = document.getElementById("btn-reset-colors");
    if (btnResetColors) {
        btnResetColors.addEventListener("click", () => {
            ratingColors = { ...defaultRatingColors };
            localStorage.setItem("fmea_rating_colors", JSON.stringify(ratingColors));
            applyRatingColors();
            populateSettingsColors();
            showToast("Colors reset to gentle system defaults.", "success");
        });
    }

    const btnPresetGentle = document.getElementById("btn-preset-gentle");
    if (btnPresetGentle) {
        btnPresetGentle.addEventListener("click", () => {
            ratingColors = { ...defaultRatingColors };
            localStorage.setItem("fmea_rating_colors", JSON.stringify(ratingColors));
            applyRatingColors();
            populateSettingsColors();
            showToast("Applied Gentle Harmonic palette.", "success");
        });
    }

    const btnPresetPastel = document.getElementById("btn-preset-pastel");
    if (btnPresetPastel) {
        btnPresetPastel.addEventListener("click", () => {
            ratingColors = { ...pastelRatingColors };
            localStorage.setItem("fmea_rating_colors", JSON.stringify(ratingColors));
            applyRatingColors();
            populateSettingsColors();
            showToast("Applied Soft Pastel palette.", "success");
        });
    }

    // Live color input updates
    ["color-crit", "color-high", "color-medium", "color-lowmed", "color-low"].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("input", () => {
                if (typeof updateColorPreviewSwatches === "function") {
                    updateColorPreviewSwatches();
                }
            });
        }
    });

    const settingsColorForm = document.getElementById("settings-color-form");
    if (settingsColorForm) {
        settingsColorForm.addEventListener("submit", () => {
            ratingColors.crit = document.getElementById("color-crit").value;
            ratingColors.high = document.getElementById("color-high").value;
            ratingColors.medium = document.getElementById("color-medium").value;
            ratingColors.lowmed = document.getElementById("color-lowmed").value;
            ratingColors.low = document.getElementById("color-low").value;
            
            localStorage.setItem("fmea_rating_colors", JSON.stringify(ratingColors));
            applyRatingColors();
            showToast("Risk rating colors saved successfully.", "success");
        });
    }

    const settingsProfileForm = document.getElementById("settings-profile-form");
    if (settingsProfileForm) {
        settingsProfileForm.addEventListener("submit", handleProfileUpdate);
    }
    const settingsPasswordForm = document.getElementById("settings-password-form");
    if (settingsPasswordForm) {
        settingsPasswordForm.addEventListener("submit", handleHODPassUpdate);
    }
    const btnExportUsers = document.getElementById("btn-export-users-vault");
    if (btnExportUsers) {
        btnExportUsers.addEventListener("click", exportUsersVault);
    }
    const inputImportUsers = document.getElementById("input-import-users-vault");
    if (inputImportUsers) {
        inputImportUsers.addEventListener("change", handleImportUsersVault);
    }

    // Interlink Banner Button Listeners
    const btnGoScanHistory = document.getElementById("btn-open-scan-history-panel-from-lib");
    if (btnGoScanHistory) {
        btnGoScanHistory.addEventListener("click", () => switchView("scan-history"));
    }
    const btnGoLibrary = document.getElementById("btn-open-lib-from-scan-history-page");
    if (btnGoLibrary) {
        btnGoLibrary.addEventListener("click", () => switchView("library"));
    }

    // Import History Log & Detail Drawer Listeners
    const btnOpenHistModal = document.getElementById("btn-open-scan-history-modal");
    if (btnOpenHistModal) {
        btnOpenHistModal.addEventListener("click", () => {
            renderScanHistoryLog();
            const modal = document.getElementById("scan-history-modal");
            if (modal) {
                modal.style.display = "";
                modal.classList.add("active");
            }
        });
    }

    const btnCloseModalDetail = document.getElementById("btn-close-scan-detail");
    if (btnCloseModalDetail) {
        btnCloseModalDetail.addEventListener("click", () => {
            const detailContainer = document.getElementById("scan-history-batch-detail");
            if (detailContainer) detailContainer.style.display = "none";
        });
    }

    const btnCloseDetailPage = document.getElementById("btn-page-close-scan-detail");
    if (btnCloseDetailPage) {
        btnCloseDetailPage.addEventListener("click", () => {
            const detailContainer = document.getElementById("page-scan-batch-detail");
            if (detailContainer) detailContainer.style.display = "none";
        });
    }

    const btnExportHist = document.getElementById("btn-export-scan-history");
    if (btnExportHist) {
        btnExportHist.addEventListener("click", exportScanHistoryCSV);
    }

    const btnClearHist = document.getElementById("btn-clear-scan-history");
    if (btnClearHist) {
        btnClearHist.addEventListener("click", clearScanHistoryLog);
    }
    
    // Audit log subtabs toggle
    document.querySelectorAll("#view-audit .sub-tab-btn").forEach(btn => {
        btn.onclick = (e) => {
            const subtab = e.currentTarget.dataset.subtab;
            if (subtab) switchAuditSubtab(subtab);
        };
    });
}

function switchSubtab(viewType, subtab) {
    const parent = document.getElementById(`view-${viewType}`);
    if (!parent) return;

    const form = getActiveFormulation();
    if (form && form[viewType]) {
        if (!form[viewType][subtab]) {
            form[viewType][subtab] = [];
        }
    }

    parent.querySelectorAll(".tabs-sub-navigation .sub-tab-btn").forEach(b => {
        if (b.dataset.subtab === subtab) {
            b.classList.add("active");
        } else {
            b.classList.remove("active");
        }
    });

    // Synchronize Dropdown Bar if present
    const dropdown = document.getElementById(`${viewType}-subtab-dropdown`);
    if (dropdown && dropdown.value !== subtab) {
        dropdown.value = subtab;
    }

    // Dynamic icon and step indicator
    const iconMap = {
        formulation: 'layers',
        raw_materials: 'flask-conical',
        application: 'target',
        packaging: 'package',
        operations: 'activity',
        logistics: 'truck'
    };
    const iconEl = document.getElementById(`${viewType}-dropdown-icon`);
    if (iconEl && iconMap[subtab]) {
        iconEl.setAttribute('data-lucide', iconMap[subtab]);
    }

    const stageMap = {
        dfmea: ['formulation', 'raw_materials', 'application', 'packaging'],
        pfmea: ['operations', 'logistics']
    };
    const stages = stageMap[viewType];
    if (stages) {
        const currentIdx = stages.indexOf(subtab);
        const indicatorEl = document.getElementById(`${viewType}-step-indicator`);
        if (indicatorEl && currentIdx !== -1) {
            indicatorEl.textContent = `${currentIdx + 1} / ${stages.length}`;
        }
    }

    const activeBtn = parent.querySelector(`.tabs-sub-navigation .sub-tab-btn[data-subtab="${subtab}"]`);
    const subtabName = activeBtn ? activeBtn.textContent.trim() : subtab;
    logGlobalActivity("Switched Subtab", viewType.toUpperCase(), `Switched worksheet tab to "${subtabName}".`);

    const searchInput = document.getElementById(`${viewType}-search`);
    if (searchInput) searchInput.value = "";

    renderFMEAWorksheet(viewType);
    if (typeof syncSidebarSubnav === "function") {
        syncSidebarSubnav(viewType, subtab);
    }
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function stepSubtab(viewType, delta) {
    if (viewType === 'audit') {
        return stepAuditSubtab(delta);
    }
    const stageMap = {
        dfmea: ['formulation', 'raw_materials', 'application', 'packaging'],
        pfmea: ['operations', 'logistics'],
        audit: ['activity_logs', 'revisions']
    };
    const stages = stageMap[viewType];
    if (!stages) return;

    const dropdown = document.getElementById(`${viewType}-subtab-dropdown`);
    const currentVal = dropdown ? dropdown.value : stages[0];
    let idx = stages.indexOf(currentVal);
    if (idx === -1) idx = 0;
    idx = (idx + delta + stages.length) % stages.length;
    switchSubtab(viewType, stages[idx]);
}
window.stepSubtab = stepSubtab;

function stepAuditSubtab(delta) {
    const stages = ['activity_logs', 'revisions'];
    const dropdown = document.getElementById("audit-subtab-dropdown");
    const currentVal = dropdown ? dropdown.value : stages[0];
    let idx = stages.indexOf(currentVal);
    if (idx === -1) idx = 0;
    idx = (idx + delta + stages.length) % stages.length;
    switchAuditSubtab(stages[idx]);
}
window.stepAuditSubtab = stepAuditSubtab;

function switchAuditSubtab(subtab) {
    document.querySelectorAll("#view-audit .sub-tab-btn").forEach(b => {
        if (b.dataset.subtab === subtab) {
            b.classList.add("active");
        } else {
            b.classList.remove("active");
        }
    });

    const dropdown = document.getElementById("audit-subtab-dropdown");
    if (dropdown && dropdown.value !== subtab) {
        dropdown.value = subtab;
    }
    const indicator = document.getElementById("audit-step-indicator");
    if (indicator) {
        indicator.textContent = subtab === "activity_logs" ? "1 / 2" : "2 / 2";
    }

    const tabAct = document.getElementById("audit-subtab-activity_logs");
    const tabChange = document.getElementById("audit-subtab-change_logs");
    const tabRev = document.getElementById("audit-subtab-revisions");
    
    if (tabAct) tabAct.style.display = subtab === "activity_logs" ? "block" : "none";
    if (tabChange) tabChange.style.display = subtab === "change_logs" ? "block" : "none";
    if (tabRev) tabRev.style.display = subtab === "revisions" ? "block" : "none";

    if (subtab === "activity_logs") {
        renderAuditPageActivityLogs();
    } else if (subtab === "change_logs") {
        renderAuditTimeline();
    } else {
        renderRevisionsLog();
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function switchLibrarySection(section) {
    document.querySelectorAll("#lib-sub-nav .sub-tab-btn").forEach(b => {
        if (b.dataset.section === section) {
            b.classList.add("active");
        } else {
            b.classList.remove("active");
        }
    });
    filterLibraryView();
}

// Subtab toggle dispatcher
function setupSubtabListeners(viewType) {
    const parent = document.getElementById(`view-${viewType}`);
    if (!parent) return;

    parent.querySelectorAll(".tabs-sub-navigation .sub-tab-btn").forEach(btn => {
        btn.onclick = (e) => {
            const subtab = e.currentTarget.dataset.subtab;
            if (subtab) {
                switchSubtab(viewType, subtab);
            }
        };
    });

    const addBtn = parent.querySelector(".btn-add-row-action");
    if (addBtn && !addBtn.dataset.bound) {
        addBtn.dataset.bound = "true";
        addBtn.addEventListener("click", () => {
            addFMEARow(viewType);
        });
    }
}

// --- AUTHENTICATION ACTIONS ---
function handleLogin(e) {
    if (e && e.preventDefault) e.preventDefault();
    const userVal = document.getElementById("login-username").value.trim();

    if (!userVal) {
        showToast("Please enter your name.", "error");
        return;
    }

    // Standardize username and email
    const cleanName = userVal.split('@')[0].trim();
    const lowerName = cleanName.toLowerCase();
    const email = userVal.includes('@') ? userVal.trim() : `${cleanName}@penchem.com`;

    // Role assignment rule: jack@penchem.com and seokfern@penchem.com are operator, all rest with @penchem.com are user
    let assignedRole = "user";
    if (lowerName === "jack" || lowerName === "seokfern" || email.toLowerCase() === "jack@penchem.com" || email.toLowerCase() === "seokfern@penchem.com") {
        assignedRole = "operator";
    }

    let user = usersDB.find(u => u.username.toLowerCase() === lowerName || (u.email && u.email.toLowerCase() === email.toLowerCase()));
    if (!user) {
        user = {
            username: cleanName,
            email: email,
            role: assignedRole,
            password: "123"
        };
        usersDB.push(user);
    } else {
        user.email = email;
        user.role = assignedRole;
    }
    localStorage.setItem("fmea_users", JSON.stringify(usersDB));

    localStorage.setItem("fmea_session_user", JSON.stringify(user));
    const formEl = document.getElementById("login-form");
    if (formEl) formEl.reset();

    showToast(`Welcome, ${user.username}! Signed in as ${assignedRole.toUpperCase()}.`, "success");
    checkActiveSession();
    logGlobalActivity("User Signed In", "Authentication", `Logged in as ${user.username} (${user.role}) [${email}].`);
    switchView("dashboard");
}

window.handleLogin = handleLogin;

function handleRegister(e) {
    if (e && e.preventDefault) e.preventDefault();
    const userVal = document.getElementById("register-username").value.trim();
    const roleVal = document.getElementById("register-role").value;
    const passVal = document.getElementById("register-password").value;

    if (!userVal) {
        showToast("Please enter a username.", "error");
        return;
    }

    if (!passVal) {
        showToast("Please enter a password.", "error");
        return;
    }

    if (usersDB.some(u => u.username.toLowerCase() === userVal.toLowerCase())) {
        showToast("Username already exists. Please choose a different name or sign in.", "error");
        return;
    }

    const newUser = { username: userVal, role: roleVal || "operator", password: passVal };
    usersDB.push(newUser);
    localStorage.setItem("fmea_users", JSON.stringify(usersDB));

    document.getElementById("register-form").reset();
    showToast(`Account "${userVal}" registered successfully! You may now sign in.`, "success");
    logGlobalActivity("Profile Registered", "Authentication", `New account registered: ${userVal} (${roleVal}).`);
    
    // Auto fill login fields and flip card
    document.getElementById("login-username").value = userVal;
    document.getElementById("login-password").value = passVal;
    document.getElementById("register-card").style.display = "none";
    document.getElementById("login-card").style.display = "block";
}

function handleFMEAAuthSubmit() {
    const passVal = document.getElementById("fmea-auth-pass-input").value;
    if (!currentUser) return;
    const savedHODPass = localStorage.getItem("fmea_hod_auth_pass") || "123";

    if (passVal === "123" || passVal === savedHODPass || passVal === currentUser.password) {
        isFMEAUnlocked = true;
        document.getElementById("fmea-auth-modal").classList.remove("active");
        showToast("Authorization Verified! DFMEA and PFMEA Worksheets Unlocked.", "success");
        logGlobalActivity("Unlocked Worksheets", "Security", "Verified security password to unlock DFMEA & PFMEA worksheets.");
        
        const target = pendingTargetView || "dfmea";
        pendingTargetView = null;
        switchView(target);
    } else {
        showToast("Security Verification Failed: Incorrect password entered.", "error");
    }
}

function handleLogout() {
    if (currentUser) {
        logGlobalActivity("User Signed Out", "Authentication", `User ${currentUser.username} logged out.`);
    }
    localStorage.removeItem("fmea_session_user");
    localStorage.removeItem("fmea_active_form_id");
    currentUser = null;
    activeFormulationId = null;
    isFMEAUnlocked = true;
    pendingTargetView = null;
    
    const loginUsernameInput = document.getElementById("login-username");
    if (loginUsernameInput) loginUsernameInput.value = "";

    const loginCard = document.getElementById("login-card");
    const registerCard = document.getElementById("register-card");
    if (loginCard) loginCard.style.display = "block";
    if (registerCard) registerCard.style.display = "none";

    const authScreen = document.getElementById("auth-screen");
    if (authScreen) authScreen.style.display = "flex";
    
    showToast("Signed out from workspace.", "success");
}

window.handleLogout = handleLogout;

// --- VIEW ROUTER NAVIGATION ---
function switchView(viewName) {
    if (!currentUser) return;

    const viewTitleMap = {
        "dashboard": "Dashboard Overview",
        "formulations": "Formulation Projects Register",
        "dfmea": "Design FMEA (DFMEA)",
        "pfmea": "Process FMEA (PFMEA)",
        "control-plan": "Control Plans Matrix",
        "library": "History Library",
        "scan-history": "Import History Log",
        "master-data": "Master Data Registry",
        "families": "Master Data Registry",
        "settings": "System Settings",
        "user-guide": "User Guide Operating Manual",
        "audit": "Operation & Activities History"
    };

    if (viewName !== "audit") {
        logGlobalActivity("Navigated View", "Navigation", `Opened ${viewTitleMap[viewName] || viewName} workspace view.`);
    }

    // Toggle nav link styles
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
        if (item.dataset.view === viewName || (viewName === "master-data" && item.dataset.view === "families") || (viewName === "families" && item.dataset.view === "master-data")) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    // Expand or collapse parent navigation groups in sidebar
    const dfmeaParent = document.getElementById("nav-parent-dfmea");
    const pfmeaParent = document.getElementById("nav-parent-pfmea");
    if (viewName === "dfmea") {
        if (dfmeaParent) dfmeaParent.classList.add("expanded");
        if (pfmeaParent) pfmeaParent.classList.remove("expanded");
        const activeSub = document.querySelector("#view-dfmea .tabs-sub-navigation .sub-tab-btn.active")?.dataset.subtab || "formulation";
        if (typeof syncSidebarSubnav === "function") syncSidebarSubnav("dfmea", activeSub);
        setTimeout(() => lucide.createIcons(), 30);
    } else if (viewName === "pfmea") {
        if (pfmeaParent) pfmeaParent.classList.add("expanded");
        if (dfmeaParent) dfmeaParent.classList.remove("expanded");
        const activeSub = document.querySelector("#view-pfmea .tabs-sub-navigation .sub-tab-btn.active")?.dataset.subtab || "operations";
        if (typeof syncSidebarSubnav === "function") syncSidebarSubnav("pfmea", activeSub);
        setTimeout(() => lucide.createIcons(), 30);
    } else {
        if (dfmeaParent) dfmeaParent.classList.remove("expanded");
        if (pfmeaParent) pfmeaParent.classList.remove("expanded");
    }

    // Toggle display of main view containers
    document.querySelectorAll(".view-panel").forEach(panel => {
        panel.classList.remove("active");
    });
    
    let activePanel = document.getElementById(`view-${viewName}`);
    if (!activePanel && (viewName === "families" || viewName === "master-data")) {
        activePanel = document.getElementById("view-master-data") || document.getElementById("view-families");
    }
    if (activePanel) {
        activePanel.classList.add("active");
    }

    // Toggle body view-mode class and quick FMEA toggle button visibility (strictly only in DFMEA & PFMEA)
    document.body.classList.remove("view-mode-dfmea", "view-mode-pfmea");
    if (viewName === "dfmea" || viewName === "pfmea") {
        document.body.classList.add(`view-mode-${viewName}`);
    }
    const toggleFMEABtn = document.getElementById("btn-toggle-fmea-view");
    if (toggleFMEABtn) {
        if (viewName === "dfmea" || viewName === "pfmea") {
            toggleFMEABtn.style.setProperty("display", "inline-flex", "important");
        } else {
            toggleFMEABtn.style.setProperty("display", "none", "important");
        }
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
    } else if (viewName === "scan-history") {
        renderScanHistoryPanel();
    } else if (viewName === "families" || viewName === "master-data") {
        renderFamiliesView();
    } else if (viewName === "settings") {
        populateSettingsColors();
        populateSettingsProfile();
        renderSettingsUserVault();
        setTimeout(() => lucide.createIcons(), 50);
    } else if (viewName === "user-guide") {
        setTimeout(() => lucide.createIcons(), 50);
    } else if (viewName === "audit") {
        const activeSubtabBtn = document.querySelector("#view-audit .sub-tab-btn.active");
        const activeSubtab = activeSubtabBtn ? activeSubtabBtn.dataset.subtab : "activity_logs";
        if (activeSubtab === "activity_logs") {
            renderAuditPageActivityLogs();
        } else if (activeSubtab === "change_logs") {
            renderAuditTimeline();
        } else {
            renderRevisionsLog();
        }
        setTimeout(() => lucide.createIcons(), 50);
    }

    // Pick & Place Floating Handle hidden permanently
    const pickPanel = document.getElementById("library-pick-sidebar");
    const pickHandle = document.getElementById("library-picker-handle");
    if (pickHandle) {
        pickHandle.style.display = "none";
    }
    if (!["dfmea", "pfmea"].includes(viewName) && pickPanel) {
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
                <div class="card-title-group">
                    <div class="card-title">${form.name}</div>
                    <span class="card-category-badge">${form.category}</span>
                </div>
                <button class="btn-icon-subtle delete-form-btn" title="Delete Formulation" aria-label="Delete Formulation">
                    <i data-lucide="trash-2" style="width: 15px; height: 15px;"></i>
                </button>
            </div>
            
            <p class="card-desc">${form.description || "No specifications description provided."}</p>
            
            <div class="card-badge-strip">
                <span class="badge-status ${statusBadgeClass}">
                    <span class="status-indicator-dot"></span>${form.status}
                </span>
                <span class="badge-status badge-revision">Rev ${form.revision}</span>
            </div>

            <div class="card-metadata">
                <div class="meta-row">
                    <div class="meta-pill"><span class="meta-lbl">DFMEA Rows:</span> <span class="meta-val-badge">${dfmeaRows}</span></div>
                    <div class="meta-pill"><span class="meta-lbl">PFMEA Rows:</span> <span class="meta-val-badge">${pfmeaRows}</span></div>
                </div>
                <div class="meta-row-text">
                    <div class="meta-line">
                        <i data-lucide="user" style="width: 12px; height: 12px; color: #94a3b8; flex-shrink: 0;"></i>
                        <span class="meta-lbl">Preparer:</span>
                        <span class="meta-val" title="${form.preparedBy}">${form.preparedBy}</span>
                    </div>
                    <div class="meta-line">
                        <i data-lucide="shield-check" style="width: 12px; height: 12px; color: #10b981; flex-shrink: 0;"></i>
                        <span class="meta-lbl">Approver:</span>
                        <span class="meta-val" title="${form.approvedBy}">${form.approvedBy}</span>
                    </div>
                </div>
            </div>

            <div class="card-actions">
                <button class="btn btn-card-action edit-dfmea-btn" title="Open Design FMEA">
                    <i data-lucide="layers" style="width: 15px; height: 15px;"></i>
                    <span>Design FMEA</span>
                </button>
                <button class="btn btn-card-action edit-pfmea-btn" title="Open Process FMEA">
                    <i data-lucide="activity" style="width: 15px; height: 15px;"></i>
                    <span>Process FMEA</span>
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
            application: [],
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
    
    logGlobalActivity("Created Formulation", "Formulations", `Created formulation project "${nameVal}" under category ${catVal}.`);

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
    
    const deletedForm = formulationsDB[index];
    const deletedName = deletedForm ? deletedForm.name : id;

    formulationsDB.splice(index, 1);
    localStorage.setItem("fmea_formulations", JSON.stringify(formulationsDB));
    
    logGlobalActivity("Deleted Formulation", "Formulations", `Deleted formulation project "${deletedName}".`);

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

    // Get Active Subtab selection (from dropdown or buttons)
    const subtabDropdown = document.getElementById(`${viewType}-subtab-dropdown`);
    const activeSubtabBtn = panel ? panel.querySelector(".tabs-sub-navigation .sub-tab-btn.active") : null;
    const activeSubtab = (subtabDropdown && subtabDropdown.value)
        ? subtabDropdown.value
        : (activeSubtabBtn && activeSubtabBtn.dataset.subtab 
            ? activeSubtabBtn.dataset.subtab 
            : (viewType === 'dfmea' ? 'formulation' : 'operations'));
    
    // Retrieve correct list data
    const list = (form[viewType] && form[viewType][activeSubtab]) ? form[viewType][activeSubtab] : [];
    
    // Apply local search filtering
    const searchInput = document.getElementById(`${viewType}-search`);
    const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const filtered = list.filter(item => {
        if (!searchVal) return true;
        const tokens = searchVal.split(/\s+/).filter(Boolean);
        const fullContent = [
            item.number,
            item.step,
            item.function,
            item.detail,
            item.characteristic,
            item.mode,
            item.effect,
            item.cause,
            item.prevention,
            item.controls,
            item.detection_controls,
            item.action,
            item.resp,
            item.result,
            item.concern
        ].filter(Boolean).join(" ").toLowerCase();
        
        return tokens.every(token => fullContent.includes(token));
    });

    // Check lock state banner
    const isLocked = form.status === "pending" || form.status === "approved";
    const lockBanner = document.getElementById(`${viewType}-lock-banner`);
    const table = document.getElementById(`${viewType}-table`);
    const btnAdd = panel.querySelector(".btn-add-row-action");
    const btnPick = panel.querySelector(".btn-toggle-picker");
    
    if (isLocked) {
        if (lockBanner) lockBanner.style.display = "flex";
        const lockText = document.getElementById(`${viewType}-lock-text`);
        if (lockText) {
            lockText.textContent = form.status === "pending" 
                ? "Worksheet is locked (Pending HOD Sign-off). Complete the review to unlock."
                : `Released Document is locked (Rev ${form.revision} Approved). Create a Revision to edit.`;
        }
        if (table) table.classList.add("locked");
        if (btnAdd) btnAdd.style.display = "none";
        if (btnPick) btnPick.style.display = "none";
    } else {
        if (lockBanner) lockBanner.style.display = "none";
        if (table) table.classList.remove("locked");
        
        // Operators can edit drafts. HODs cannot edit draft, they review and sign off.
        if (currentUser && currentUser.role === "hod") {
            if (table) table.classList.add("locked"); // HOD cannot edit, read-only
            if (btnAdd) btnAdd.style.display = "none";
            if (btnPick) btnPick.style.display = "none";
        } else {
            if (btnAdd) btnAdd.style.display = "inline-flex";
            if (btnPick) btnPick.style.display = "inline-flex";
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
        const effRSev = (item.result_sev !== undefined && item.result_sev !== null && item.result_sev !== "") ? parseInt(item.result_sev, 10) : item.sev;
        const effROcc = (item.result_occ !== undefined && item.result_occ !== null && item.result_occ !== "") ? parseInt(item.result_occ, 10) : item.occ;
        const effRDet = (item.result_det !== undefined && item.result_det !== null && item.result_det !== "") ? parseInt(item.result_det, 10) : item.det;
        const resultRpn = effRSev * effROcc * effRDet;
        const tr = document.createElement("tr");
        tr.id = `row-${item.id}`;

        let sevOpts = "", occOpts = "", detOpts = "";
        let rSevOpts = "", rOccOpts = "", rDetOpts = "";
        for (let i = 1; i <= 10; i++) {
            sevOpts += `<option value="${i}" ${item.sev == i ? 'selected' : ''}>${i}</option>`;
            occOpts += `<option value="${i}" ${item.occ == i ? 'selected' : ''}>${i}</option>`;
            detOpts += `<option value="${i}" ${item.det == i ? 'selected' : ''}>${i}</option>`;
            rSevOpts += `<option value="${i}" ${effRSev == i ? 'selected' : ''}>${i}</option>`;
            rOccOpts += `<option value="${i}" ${effROcc == i ? 'selected' : ''}>${i}</option>`;
            rDetOpts += `<option value="${i}" ${effRDet == i ? 'selected' : ''}>${i}</option>`;
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
                <select class="cell-select select-rating ${getRatingClass(effRSev)}" data-field="result_sev" aria-label="Revised Severity S">
                    ${rSevOpts}
                </select>
            </td>
            <td>
                <select class="cell-select select-rating ${getRatingClass(effROcc)}" data-field="result_occ" aria-label="Revised Occurrence O">
                    ${rOccOpts}
                </select>
            </td>
            <td>
                <select class="cell-select select-rating ${getRatingClass(effRDet)}" data-field="result_det" aria-label="Revised Detection D">
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
                    <button class="btn-table-action save-lib-btn" title="Add item to History Library" aria-label="Save to library">
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
                if (sidebar && sidebar.classList.contains("collapsed")) {
                    if (typeof toggleRatingGuide === "function") {
                        toggleRatingGuide(true);
                    }
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
    if (currentUser && currentUser.role === "operator") {
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
    else if (currentUser && currentUser.role === "hod") {
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
    
    const panel = document.getElementById(`view-${viewType}`);
    const activeSubtabBtn = panel ? panel.querySelector(".tabs-sub-navigation .sub-tab-btn.active") : null;
    const activeSubtab = activeSubtabBtn && activeSubtabBtn.dataset.subtab 
        ? activeSubtabBtn.dataset.subtab 
        : (viewType === 'dfmea' ? 'formulation' : 'operations');
    
    if (!form[viewType]) form[viewType] = {};
    if (!form[viewType][activeSubtab]) form[viewType][activeSubtab] = [];
    
    const list = form[viewType][activeSubtab];

    // Check if an active search query exists in the toolbar
    const searchInput = document.getElementById(`${viewType}-search`);
    const searchVal = searchInput ? searchInput.value.trim() : "";
    const lowerSearch = searchVal.toLowerCase();

    // Look for matching/related rows currently filtered by the search query
    let matchedRow = null;
    let insertIndex = list.length;
    
    if (lowerSearch) {
        // Find existing row that matches the search term
        const matchIdx = list.findIndex(r => {
            const rowText = [r.step, r.detail, r.function, r.characteristic].filter(Boolean).join(" ").toLowerCase();
            return rowText.includes(lowerSearch);
        });

        if (matchIdx !== -1) {
            matchedRow = list[matchIdx];
            // Find the last row belonging to this exact same step/item to group them together
            let lastGroupIdx = matchIdx;
            for (let i = matchIdx + 1; i < list.length; i++) {
                if (list[i].step && matchedRow.step && list[i].step.trim().toLowerCase() === matchedRow.step.trim().toLowerCase()) {
                    lastGroupIdx = i;
                }
            }
            insertIndex = lastGroupIdx + 1;
        }
    }

    const newRow = {
        id: "row-" + Date.now(),
        number: matchedRow ? (matchedRow.number || (list.length + 1).toString()) : (list.length + 1).toString(),
        step: matchedRow ? matchedRow.step : searchVal,
        function: matchedRow ? matchedRow.function : "",
        detail: matchedRow ? matchedRow.detail : "",
        characteristic: matchedRow ? matchedRow.characteristic : "",
        mode: "",
        effect: "",
        sev: 1,
        cause: "",
        occ: 1,
        prevention: "",
        detection_controls: "",
        det: 1,
        action: "",
        resp: currentUser ? currentUser.username : "",
        result: "",
        result_date: "",
        result_sev: 1,
        result_occ: 1,
        result_det: 1,
        concern: "",
        happened: "No",
        status: "not-started"
    };

    list.splice(insertIndex, 0, newRow);
    
    // Log in audit trail
    const auditItem = {
        timestamp: new Date().toLocaleString(),
        user: currentUser ? currentUser.username : "Operator",
        action: "Row Added",
        details: matchedRow 
            ? `Added new failure mode row for related item [${matchedRow.step}] in ${viewType.toUpperCase()} -> ${activeSubtab}`
            : `Created new entry in ${viewType.toUpperCase()} -> ${activeSubtab}`
    };
    if (!form.auditLogs) form.auditLogs = [];
    form.auditLogs.unshift(auditItem);

    logGlobalActivity(`Added ${viewType.toUpperCase()} Row`, viewType.toUpperCase(), `Created new row for related item "${newRow.step || 'General'}" in ${viewType.toUpperCase()} (${activeSubtab}).`);

    saveFormulationsDB();
    renderFMEAWorksheet(viewType);
    
    // Focus on failure mode (mode) if step is already filled, else step
    setTimeout(() => {
        const row = document.getElementById(`row-${newRow.id}`);
        if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
            const focusTarget = newRow.step 
                ? (row.querySelector('[data-field="mode"]') || row.querySelector(".cell-input"))
                : row.querySelector(".cell-input");
            if (focusTarget) focusTarget.focus();
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

            // Sync Revised S, O, D if following initial ratings
            const resField = "result_" + field;
            if (!item[resField] || item[resField] == oldVal) {
                item[resField] = value;
                const resSelect = row.querySelector(`[data-field="${resField}"]`);
                if (resSelect) {
                    resSelect.value = value;
                    resSelect.className = `cell-select select-rating ${getRatingClass(value)}`;
                }
            }

            const effRSev = item.result_sev || item.sev || 1;
            const effROcc = item.result_occ || item.occ || 1;
            const effRDet = item.result_det || item.det || 1;
            const resRpn = effRSev * effROcc * effRDet;
            const resBadge = row.querySelector('[data-field="result-rpn-badge"]');
            if (resBadge) {
                resBadge.textContent = resRpn;
                resBadge.className = `rpn-badge ${getRpnClass(resRpn)}`;
                resBadge.removeAttribute("style");
            }
        }
    } else if (["result_sev", "result_occ", "result_det"].includes(field)) {
        const item = list[index];
        const effRSev = item.result_sev || item.sev || 1;
        const effROcc = item.result_occ || item.occ || 1;
        const effRDet = item.result_det || item.det || 1;
        const rpn = effRSev * effROcc * effRDet;
        const row = document.getElementById(`row-${rowId}`);
        if (row) {
            const badge = row.querySelector('[data-field="result-rpn-badge"]');
            if (badge) {
                badge.textContent = rpn;
                badge.className = `rpn-badge ${getRpnClass(rpn)}`;
                badge.removeAttribute("style");
            }
        }
    }

    // Write change log trail
    if (oldVal !== value) {
        const details = `Row #${index + 1} (${list[index].step || "Step"}): Modified ${field} from "${oldVal}" to "${value}"`;
        const audit = {
            timestamp: new Date().toLocaleString(),
            user: currentUser.username,
            action: "Cell Edit",
            details: details
        };
        form.auditLogs.unshift(audit);

        logGlobalActivity(`Updated ${viewType.toUpperCase()} Field`, viewType.toUpperCase(), details);
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
    const details = `Deleted row item [${removed.step || "Unnamed"}] in ${viewType.toUpperCase()} -> ${subtab}`;
    const audit = {
        timestamp: new Date().toLocaleString(),
        user: currentUser.username,
        action: "Row Deleted",
        details: details
    };
    form.auditLogs.unshift(audit);

    logGlobalActivity(`Deleted ${viewType.toUpperCase()} Row`, viewType.toUpperCase(), details);

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
    logGlobalActivity("Saved to Library", "Library", `Saved item [${item.step || "Unnamed"}] to global reference library.`);
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
    logGlobalActivity("Requested Approval", "Approval", `Submitted formulation "${form.name}" (Rev ${form.revision}) for HOD validation.`);

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
        logGlobalActivity("Approved Release", "Approval", `HOD approved and certified formulation "${form.name}" (Rev ${form.revision}). Comments: ${comments || "None"}`);
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
        logGlobalActivity("Rejected Draft", "Approval", `HOD returned formulation "${form.name}" (Rev ${form.revision}) to draft mode. Feedback: ${comments || "None"}`);
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
    const modal = document.getElementById("revision-modal");
    if (modal) {
        modal.style.display = "";
        modal.classList.add("active");
    }
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
    logGlobalActivity("Created Revision Draft", "Formulations", `Created revision draft Rev ${newRev} for "${form.name}". Reason: ${reason}`);

    document.getElementById("revision-modal").classList.remove("active");
    
    // Refresh FMEA worksheet
    const activeView = document.querySelector(".view-panel.active").id.replace("view-", "");
    renderFMEAWorksheet(activeView);
    updateDashboard();
    
    showToast(`Created new revision draft Rev ${newRev}.`, "success");
}

// --- DYNAMIC CONTROL PLAN BUILDER & CLOSED-LOOP FEEDBACK ---
let currentControlPlanStage = "ALL";

function filterControlPlanStage(stage) {
    currentControlPlanStage = stage || "ALL";
    if (typeof switchView === 'function') {
        switchView("control-plan");
    }
    
    // Highlight subtab button
    document.querySelectorAll("#view-control-plan .sub-tab-btn").forEach(btn => {
        if (btn.dataset.substage === currentControlPlanStage) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    renderControlPlan();
}

function openActualResultsModal() {
    populateCheckpointDropdown();
    const modal = document.getElementById("modal-closed-loop-feedback");
    if (modal) {
        modal.classList.add("active");
    }
}

function closeModal(modalId) {
    const modal = typeof modalId === "string" ? document.getElementById(modalId) : modalId;
    if (modal) {
        modal.classList.remove("active");
        modal.style.display = "none";
    }
}

function populateCheckpointDropdown() {
    const targetType = document.getElementById("feedback-fmea-type") ? document.getElementById("feedback-fmea-type").value : "dfmea";
    const select = document.getElementById("feedback-checkpoint-select");
    if (!select) return;

    select.innerHTML = '<option value="ALL">All Active Checkpoints (Global Batch Update)</option>';
    const form = getActiveFormulation();

    if (form) {
        if (targetType === "dfmea" && form.dfmea) {
            ["raw_materials", "formulation", "packaging"].forEach(sub => {
                (form.dfmea[sub] || []).forEach(row => {
                    if (row.step) {
                        const opt = document.createElement("option");
                        opt.value = row.step;
                        opt.textContent = `[DFMEA - ${sub.toUpperCase()}] ${row.step}`;
                        select.appendChild(opt);
                    }
                });
            });
        } else if (targetType === "pfmea" && form.pfmea) {
            ["operations", "logistics"].forEach(sub => {
                (form.pfmea[sub] || []).forEach(row => {
                    if (row.step) {
                        const opt = document.createElement("option");
                        opt.value = row.step;
                        opt.textContent = `[PFMEA - ${sub.toUpperCase()}] ${row.step}`;
                        select.appendChild(opt);
                    }
                });
            });
        }
    }
}

function submitClosedLoopFMEAUpdate(e) {
    if (e) e.preventDefault();
    const form = getActiveFormulation();
    const stepVal = document.getElementById("feedback-checkpoint-select") ? document.getElementById("feedback-checkpoint-select").value : "ALL";
    const stage = document.getElementById("feedback-stage") ? document.getElementById("feedback-stage").value : "IPQC";
    const ncrNo = document.getElementById("feedback-ncr-no") ? document.getElementById("feedback-ncr-no").value.trim() : "";
    const defectType = document.getElementById("feedback-defect-type") ? document.getElementById("feedback-defect-type").value.trim() : "Shop-floor non-conformance";
    const lessonsLearned = document.getElementById("feedback-lessons-learned") ? document.getElementById("feedback-lessons-learned").value.trim() : "Knowledge captured";
    const newOcc = parseInt(document.getElementById("feedback-new-occ").value, 10) || 1;
    const newDet = parseInt(document.getElementById("feedback-new-det").value, 10) || 1;

    let updatedCount = 0;
    if (form) {
        ["raw_materials", "formulation", "packaging"].forEach(sub => {
            if (form.dfmea && form.dfmea[sub]) {
                form.dfmea[sub].forEach(row => {
                    if (row.step === stepVal || stepVal === "ALL") {
                        row.occ = newOcc;
                        row.det = newDet;
                        row.rpn = (row.sev || 1) * newOcc * newDet;
                        row.happened = "Yes";
                        row.concern = `[${stage}${ncrNo ? ' | ' + ncrNo : ''}] Defect: ${defectType} | Lessons: ${lessonsLearned}`;
                        updatedCount++;
                    }
                });
            }
        });
        ["operations", "logistics"].forEach(sub => {
            if (form.pfmea && form.pfmea[sub]) {
                form.pfmea[sub].forEach(row => {
                    if (row.step === stepVal || stepVal === "ALL") {
                        row.occ = newOcc;
                        row.det = newDet;
                        row.rpn = (row.sev || 1) * newOcc * newDet;
                        row.happened = "Yes";
                        row.concern = `[${stage}${ncrNo ? ' | ' + ncrNo : ''}] Defect: ${defectType} | Lessons: ${lessonsLearned}`;
                        updatedCount++;
                    }
                });
            }
        });

        // Add to Knowledge Library as a Lesson Learned reference item
        const lessonLibItem = {
            id: "lib-lesson-" + Date.now(),
            category: form.category || "Epoxy Adhesives",
            section: stage.toLowerCase(),
            step: stepVal !== "ALL" ? stepVal : "Shop-floor Closed Loop",
            mode: `${defectType}${ncrNo ? ' (' + ncrNo + ')' : ''}`,
            cause: `NCR / 8D Lessons Learned: ${lessonsLearned}`,
            sev: 7,
            occ: newOcc,
            det: newDet,
            action: `Closed-Loop FMEA Library Update: RPN recalculated (Occ=${newOcc}, Det=${newDet})`
        };
        if (typeof libraryDB !== 'undefined' && Array.isArray(libraryDB)) {
            libraryDB.push(lessonLibItem);
            localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
        }

        saveFormulationsDB();
        logGlobalActivity("Closed-Loop FMEA Update", "Continuous Improvement", `Updated checkpoint "${stepVal}" with QC Result & NCR/8D: ${defectType}. Lessons Learned: ${lessonsLearned}`);
        showToast(`FMEA Library updated! ${updatedCount} checkpoint(s) revised with new Occurrence (${newOcc}) & Detection (${newDet}).`, "success");
    } else {
        showToast("Closed-loop feedback logged in system audit trace.", "success");
    }

    closeModal("modal-closed-loop-feedback");
    updateDashboard();
}

function renderControlPlan() {
    const form = getActiveFormulation();
    const tbody = document.getElementById("control-plan-tbody");
    const emptyState = document.getElementById("control-plan-empty");
    const banner = document.getElementById("cp-lock-banner");
    
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!form) {
        if (emptyState) emptyState.style.display = "block";
        if (banner) banner.style.display = "none";
        return;
    }

    // Sync status locks
    const isLocked = form.status === "pending" || form.status === "approved" || currentUser.role === "hod";
    const cpTable = document.getElementById("control-plan-table");
    
    if (isLocked) {
        if (banner) banner.style.display = "flex";
        if (cpTable) cpTable.classList.add("locked");
    } else {
        if (banner) banner.style.display = "none";
        if (cpTable) cpTable.classList.remove("locked");
    }

    // Auto-generate plan steps from DFMEA & PFMEA tabs
    const fmeaSteps = [];
    
    // IQC Stage (Incoming Material & Raw Material)
    if (currentControlPlanStage === "ALL" || currentControlPlanStage === "IQC") {
        ((form.dfmea && form.dfmea.raw_materials) || []).forEach(item => {
            if (item.step) fmeaSteps.push({ stage: "IQC", source: "dfmea", name: item.step, control: item.controls || item.prevention || item.detection_controls, reaction: item.action });
        });
        ((form.dfmea && form.dfmea.packaging) || []).forEach(item => {
            if (item.step) fmeaSteps.push({ stage: "IQC", source: "dfmea", name: item.step, control: item.controls || item.prevention || item.detection_controls, reaction: item.action });
        });
    }

    // IPQC Stage (In-Process Formulation & Operations)
    if (currentControlPlanStage === "ALL" || currentControlPlanStage === "IPQC") {
        ((form.dfmea && form.dfmea.formulation) || []).forEach(item => {
            if (item.step) fmeaSteps.push({ stage: "IPQC", source: "dfmea", name: item.step, control: item.controls || item.prevention || item.detection_controls, reaction: item.action });
        });
        ((form.pfmea && form.pfmea.operations) || []).forEach(item => {
            if (item.step) fmeaSteps.push({ stage: "IPQC", source: "pfmea", name: item.step, control: item.controls || item.prevention || item.detection_controls, reaction: item.action });
        });
    }

    // OQC Stage (Finished Goods, Packing & Logistics)
    if (currentControlPlanStage === "ALL" || currentControlPlanStage === "OQC") {
        ((form.pfmea && form.pfmea.logistics) || []).forEach(item => {
            if (item.step) fmeaSteps.push({ stage: "OQC", source: "pfmea", name: item.step, control: item.controls || item.prevention || item.detection_controls, reaction: item.action });
        });
    }

    if (fmeaSteps.length === 0) {
        if (emptyState) emptyState.style.display = "block";
        return;
    }
    
    if (emptyState) emptyState.style.display = "none";

    // Rebuild controlPlan list mapping to FMEA items
    const updatedControlPlan = [];

    fmeaSteps.forEach((step, idx) => {
        let existing = form.controlPlan.find(cp => cp.opName === step.name);
        
        if (!existing) {
            existing = {
                id: `cp-${idx}-${Date.now()}`,
                opName: step.name,
                stage: step.stage,
                machine: "",
                characteristic: "",
                specification: "",
                method: "",
                sampleSize: "",
                controlMethod: step.control || "",
                reactionPlan: step.reaction || ""
            };
        } else {
            existing.controlMethod = step.control || existing.controlMethod;
            existing.reactionPlan = step.reaction || existing.reactionPlan;
            existing.stage = step.stage;
        }
        
        updatedControlPlan.push(existing);
        
        const stageClass = existing.stage === 'IQC' ? 'cp-stage-iqc' :
                           existing.stage === 'IPQC' ? 'cp-stage-ipqc' :
                           existing.stage === 'OQC' ? 'cp-stage-oqc' : 'cp-stage-default';
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-align: center;"><span class="cp-row-number">${idx + 1}</span></td>
            <td>
                <div style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                    <span class="cp-stage-badge ${stageClass}">${existing.stage || 'CP'}</span>
                    <strong style="color: var(--text-primary); font-size: 0.84rem;">${existing.opName}</strong>
                </div>
            </td>
            <td>
                <textarea class="cell-input" data-field="machine" placeholder="Machine / line" aria-label="Machine">${existing.machine || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="characteristic" placeholder="Control parameter" aria-label="Characteristic">${existing.characteristic || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="specification" placeholder="Specification / tolerance" aria-label="Specification">${existing.specification || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="method" placeholder="Measurement method" aria-label="Method">${existing.method || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="sampleSize" placeholder="Size & frequency" aria-label="Sample">${existing.sampleSize || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="controlMethod" placeholder="Control method" aria-label="Control Tool">${existing.controlMethod || ''}</textarea>
            </td>
            <td>
                <textarea class="cell-input" data-field="reactionPlan" placeholder="Reaction plan" aria-label="Reaction Plan">${existing.reactionPlan || ''}</textarea>
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

    logGlobalActivity("Exported Control Plan", "Import/Export", `Exported Control Plan CSV for formulation "${form.name}" (Rev ${form.revision}).`);

    showToast("Control Plan CSV downloaded.", "success");
}

// --- PICK & PLACE EXPLORER DRAWERS ---
function togglePickerSidebar() {
    const sidebar = document.getElementById("library-pick-sidebar");
    const isCollapsed = sidebar.classList.toggle("collapsed");
    
    const handle = document.getElementById("library-picker-handle");
    const handleIcon = document.getElementById("picker-handle-icon");

    if (handle) {
        handle.style.display = "none";
    }

    if (!isCollapsed) {
        
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
        details: `Imported historical reference row [${libItem.step}] from History Library into ${activeView.toUpperCase()}`
    };
    form.auditLogs.unshift(audit);

    logGlobalActivity("Placed Library Item", "Library", `Placed reference item [${libItem.step || "Unnamed"}] into active ${activeView.toUpperCase()} worksheet.`);

    saveFormulationsDB();
    renderFMEAWorksheet(activeView);
    updateDashboard();

    showToast(`Placed [${libItem.step}] in worksheet.`, "success");
}

// --- HISTORY LIBRARY VIEW ---
function renderLibraryView() {
    const tbody = document.getElementById("library-tbody");
    const emptyState = document.getElementById("library-empty");
    tbody.innerHTML = "";

    const query = document.getElementById("lib-search").value.trim().toLowerCase();
    const catFilter = document.getElementById("lib-filter-category").value;
    
    // Get active section from tabs sub-nav
    const activeBtn = document.querySelector("#lib-sub-nav .sub-tab-btn.active");
    const activeSection = activeBtn ? activeBtn.dataset.section : "formulation";

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
        const rSev = parseInt(item.result_sev, 10);
        const rOcc = parseInt(item.result_occ, 10);
        const rDet = parseInt(item.result_det, 10);
        const hasResultRpn = !isNaN(rSev) && !isNaN(rOcc) && !isNaN(rDet);
        const revisedRpn = hasResultRpn ? (rSev * rOcc * rDet) : null;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><span class="row-index" style="font-weight: 600;">${item.number || (idx + 1)}</span></td>
            <td>
                <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                    <span class="card-category-badge">${item.category}</span>
                    ${item.source === "Master Data" ? `<span class="master-lib-chip" title="Synchronized from Master Data Center">Master</span>` : ''}
                </div>
            </td>
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
                ${item.result_sev ? `<span class="rating-cell-badge ${getRatingClass(item.result_sev)}">${item.result_sev}</span>` : `<span style="color: var(--text-muted); font-weight: 600;">-</span>`}
            </td>
            <td style="text-align: center;">
                ${item.result_occ ? `<span class="rating-cell-badge ${getRatingClass(item.result_occ)}">${item.result_occ}</span>` : `<span style="color: var(--text-muted); font-weight: 600;">-</span>`}
            </td>
            <td style="text-align: center;">
                ${item.result_det ? `<span class="rating-cell-badge ${getRatingClass(item.result_det)}">${item.result_det}</span>` : `<span style="color: var(--text-muted); font-weight: 600;">-</span>`}
            </td>
            <td style="text-align: center;">
                ${hasResultRpn ? `<span class="rpn-badge ${getRpnClass(revisedRpn)}">${revisedRpn}</span>` : `<span style="color: var(--text-muted); font-weight: 600;">-</span>`}
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
    
    logGlobalActivity("Created Library Item", "Library", `Created reference item [${step || "Unnamed"}] under category "${cat}".`);

    document.getElementById("lib-create-form").reset();
    document.getElementById("lib-modal").classList.remove("active");
    
    showToast("Saved to reference database.", "success");
    renderLibraryView();
}

function deleteLibraryItem(id) {
    const idx = libraryDB.findIndex(l => l.id === id);
    if (idx === -1) return;
    
    const deletedItem = libraryDB[idx];
    const stepName = deletedItem ? deletedItem.step : id;

    libraryDB.splice(idx, 1);
    localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
    
    logGlobalActivity("Deleted Library Item", "Library", `Removed reference item [${stepName || "Unnamed"}] from library.`);

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
    } else if (libItem.section === "application") {
        viewType = "dfmea";
        subtab = "application";
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
    if (!tbody) return;
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
    if (val === "" || val === null || val === undefined || val === "-") return "";
    const num = parseInt(val, 10);
    if (isNaN(num)) return "";
    if (num >= 9) return "rating-red";
    if (num >= 7) return "rating-orange";
    if (num >= 5) return "rating-yellow";
    if (num >= 3) return "rating-lightgreen";
    return "rating-green";
}

function getRpnClass(rpn) {
    if (rpn === "" || rpn === null || rpn === undefined || rpn === "-") return "";
    const num = parseInt(rpn, 10);
    if (isNaN(num)) return "";
    if (num < 50) return "rpn-low";
    if (num < 125) return "rpn-medium";
    if (num < 300) return "rpn-high";
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

    currentCSVFileName = file.name;
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

    // Immediately hide and close modal dialog so it disappears instantly
    const modalEl = document.getElementById("lib-import-modal");
    if (modalEl) {
        modalEl.classList.remove("active");
        modalEl.style.display = "none";
    }

    const destSelect = document.getElementById("import-destination-select");
    const dest = destSelect ? destSelect.value : "library";

    // Detect primary section of imported items
    const primarySection = tempParsedLibraryRows[0]?.section || "raw_material";

    if (dest === "active_worksheet") {
        const form = getActiveFormulation();
        if (!form) {
            showToast("No active formulation selected to import into.", "error");
            return;
        }

        let targetView = "dfmea";
        let targetSubtab = "raw_materials";

        if (["process", "packing_shipment"].includes(primarySection)) {
            targetView = "pfmea";
            targetSubtab = primarySection === "packing_shipment" ? "logistics" : "operations";
        } else {
            targetView = "dfmea";
            if (primarySection === "formulation") targetSubtab = "formulation";
            else if (primarySection === "packaging") targetSubtab = "packaging";
            else targetSubtab = "raw_materials";
        }

        tempParsedLibraryRows.forEach((row, i) => {
            const newRow = {
                id: "row-" + Date.now() + "-" + i,
                number: row.number || (form[targetView][targetSubtab].length + 1),
                step: row.step || "",
                function: row.function || "",
                detail: row.detail || "",
                characteristic: row.characteristic || "",
                mode: row.mode || "",
                effect: row.effect || "",
                sev: parseInt(row.sev, 10) || 1,
                cause: row.cause || "",
                occ: parseInt(row.occ, 10) || 1,
                prevention: row.prevention || "",
                detection_controls: row.detection_controls || "",
                det: parseInt(row.det, 10) || 1,
                action: row.action || "",
                resp: row.resp || "",
                result: row.result || "",
                result_date: row.result_date || "",
                result_sev: parseInt(row.result_sev, 10) || 1,
                result_occ: parseInt(row.result_occ, 10) || 1,
                result_det: parseInt(row.result_det, 10) || 1,
                concern: row.concern || "",
                happened: row.happened || "No",
                status: "not-started"
            };
            form[targetView][targetSubtab].push(newRow);
        });

        // Write change log audit
        form.auditLogs.unshift({
            timestamp: new Date().toLocaleString(),
            user: currentUser.username,
            action: "Excel Import",
            details: `Imported ${tempParsedLibraryRows.length} row(s) into ${targetView.toUpperCase()} -> ${targetSubtab}`
        });

        // ALSO automatically append all scanned rows into global libraryDB so History Library retains everything scanned!
        libraryDB.push(...tempParsedLibraryRows);
        localStorage.setItem("fmea_library", JSON.stringify(libraryDB));

        saveFormulationsDB();
        
        // Auto-switch view and sub-tab to display imported result immediately
        switchView(targetView);
        const subTabBtn = document.querySelector(`#view-${targetView} .tabs-sub-navigation .sub-tab-btn[data-subtab="${targetSubtab}"]`);
        if (subTabBtn) subTabBtn.click();

        renderFMEAWorksheet(targetView);
        updateDashboard();
        showToast(`Imported ${tempParsedLibraryRows.length} row(s) into ${targetView.toUpperCase()} (${targetSubtab}) and History Library.`, "success");
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

        // Auto-switch to Library view, reset search/category filters, and open target section tab to show results automatically
        switchView("library");
        
        const libSearchInput = document.getElementById("lib-search");
        if (libSearchInput) libSearchInput.value = "";
        const libCatFilter = document.getElementById("lib-filter-category");
        if (libCatFilter) libCatFilter.value = "all";

        const libSubBtn = document.querySelector(`#lib-sub-nav .sub-tab-btn[data-section="${primarySection}"]`);
        if (libSubBtn) libSubBtn.click();

        renderLibraryView();
        showToast(`Imported ${tempParsedLibraryRows.length} reference item(s) into History Library.`, "success");
    }

    // Automatically record scan history event
    const targetAreaName = dest === "library"
        ? `History Library (${primarySection.toUpperCase()})`
        : `Active Worksheet (${(dest === "active_worksheet" && typeof targetView !== 'undefined') ? targetView.toUpperCase() : 'WORKSHEET'})`;

    const scanRecord = {
        id: "scan-" + Date.now(),
        timestamp: new Date().toLocaleString(),
        filename: currentCSVFileName || `Imported_Excel_Data_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`,
        targetArea: targetAreaName,
        section: primarySection,
        rowCount: tempParsedLibraryRows.length,
        importedBy: currentUser ? currentUser.username : "Operator",
        items: tempParsedLibraryRows.map(r => ({ ...r }))
    };
    scanHistoryDB.unshift(scanRecord);
    localStorage.setItem("fmea_scan_history", JSON.stringify(scanHistoryDB));
    renderScanHistoryPanel();
    renderScanHistoryLog();

    // Immediately close modal window so it disappears instantly
    const importModal = document.getElementById("lib-import-modal");
    if (importModal) {
        importModal.classList.remove("active");
        importModal.style.display = "none";
    }

    // Clear temp state
    tempParsedLibraryRows = [];
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

    // Helper to find all header indices matching alias tokens
    const findAllIndices = (exactAliases, longAliases = []) => {
        const matches = [];
        headers.forEach((h, idx) => {
            if (exactAliases.includes(h) || longAliases.some(a => a.length > 1 && h.includes(a))) {
                matches.push(idx);
            }
        });
        return matches;
    };

    // Find mapped headers representing customer's Excel columns
    const idxNumber = getIndex(["id", "#", "no", "no.", "num", "number", "item no", "row", "row no", "seq", "sequence", "sn", "s/n"]);
    const idxCat = getIndex(["category", "family", "product family", "process family", "product category", "product or process family"]);
    const idxType = getIndex(["type", "fmea type", "section", "dfmea/pfmea", "fmea section"]);
    const idxStep = getIndex(["step", "process step", "design item", "ingredient", "item/step", "process step / item", "step/ingredient", "item / step"]);
    const idxFunction = getIndex(["function", "intended use", "process function", "design function", "function/spec", "function / spec"]);
    const idxDetail = getIndex(["detail", "deep detail", "process step - deep detail", "deep detail (process step)"]);
    const idxCharacteristic = getIndex(["characteristic", "ctq", "kpc", "process characteristic", "design characteristic"]);
    const idxMode = getIndex(["failure mode", "mode", "potential failure mode"]);
    const idxEffect = getIndex(["effect", "effects", "potential effect", "effect of failure", "potential effects of failure"]);
    const idxCause = getIndex(["cause", "causes", "potential cause", "potential cause/mechanism of failure", "potential cause of failure"]);
    const idxPrevention = getIndex(["prevention", "prevention control", "current prevention", "current prevention control", "prevention controls"]);
    const idxDetectionControls = getIndex(["detection control", "detection method", "current detection", "current detection control", "detection controls"]);
    
    const sIndices = findAllIndices(["s", "sev", "severity", "sev."], ["severity"]);
    const oIndices = findAllIndices(["o", "occ", "occurrence", "occ."], ["occurrence"]);
    const dIndices = findAllIndices(["d", "det", "detection", "det."], ["detection"]);

    const idxSev = sIndices.length > 0 ? sIndices[0] : getIndex(["sev", "severity", "s", "sev."]);
    const idxOcc = oIndices.length > 0 ? oIndices[0] : getIndex(["occ", "occurrence", "o", "occ."]);
    const idxDet = dIndices.length > 0 ? dIndices[0] : getIndex(["det", "detection", "d", "det."]);

    const idxAction = getIndex(["action", "recommended action", "actions", "improvement", "recommended actions"]);
    const idxResult = getIndex(["result", "action taken", "action results", "results"]);
    const idxResultDate = getIndex(["date completed", "result date", "completion date", "target date"]);

    let idxResultSev = getIndex(["revised s", "revised severity", "result sev", "new s", "new sev", "new severity", "action s", "result s"]);
    if (idxResultSev === -1 && sIndices.length >= 2) {
        idxResultSev = sIndices[1];
    }

    let idxResultOcc = getIndex(["revised o", "revised occurrence", "result occ", "new o", "new occ", "new occurrence", "action o", "result o"]);
    if (idxResultOcc === -1 && oIndices.length >= 2) {
        idxResultOcc = oIndices[1];
    }

    let idxResultDet = getIndex(["revised d", "revised detection", "result det", "new d", "new det", "new detection", "action d", "result d"]);
    if (idxResultDet === -1 && dIndices.length >= 2) {
        idxResultDet = dIndices[1];
    }

    const idxConcern = getIndex(["concern", "special concern"]);
    const idxHappened = getIndex(["happened", "case happened", "case happen", "occurred"]);
    const idxOwner = getIndex(["owner", "target date", "owner & target date", "resp", "responsibility", "responsible"]);

    const parsedItems = [];

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const cells = rows[i];
        if (!cells || cells.length === 0) continue;
        
        // Skip rows that are completely empty
        const isRowEmpty = cells.every(c => c === null || c === undefined || String(c).trim() === "");
        if (isRowEmpty) continue;

        const getVal = (headerIdx, defaultIdx, fallbackVal = "") => {
            let idx = -1;
            if (headerIdx !== -1) {
                idx = headerIdx;
            } else if (bestScore === 0 && defaultIdx !== -1) {
                idx = defaultIdx;
            }
            if (idx !== -1 && cells[idx] !== undefined && cells[idx] !== null) {
                return String(cells[idx]).trim();
            }
            return fallbackVal;
        };

        const parseRating = (rawVal, defaultVal = 1) => {
            if (!rawVal) return defaultVal;
            const parsed = parseInt(String(rawVal).replace(/\D/g, ""), 10);
            if (isNaN(parsed) || parsed < 1) return defaultVal;
            return Math.min(parsed, 10);
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
        const sev = parseRating(getVal(idxSev, 5, "1"), 1);
        const occ = parseRating(getVal(idxOcc, 6, "1"), 1);
        const det = parseRating(getVal(idxDet, 7, "1"), 1);
        const action = getVal(idxAction, 8, "");
        const ownerVal = getVal(idxOwner, -1, "");
        const resultVal = getVal(idxResult, -1, "");
        const resultDateVal = getVal(idxResultDate, -1, "");

        const rawResultSev = getVal(idxResultSev, -1, "");
        const rawResultOcc = getVal(idxResultOcc, -1, "");
        const rawResultDet = getVal(idxResultDet, -1, "");

        const resultSevVal = rawResultSev ? parseRating(rawResultSev, sev) : sev;
        const resultOccVal = rawResultOcc ? parseRating(rawResultOcc, occ) : occ;
        const resultDetVal = rawResultDet ? parseRating(rawResultDet, det) : det;

        const concernVal = getVal(idxConcern, -1, "");
        const happenedVal = getVal(idxHappened, -1, "No");

        // Category validation against dynamic product or process families registry
        let category = rawCat ? rawCat.trim() : "Epoxy Adhesives";
        const matchedFam = familiesDB.find(f => f.name.toLowerCase() === category.toLowerCase());
        if (matchedFam) {
            category = matchedFam.name;
        }

        // Smart Mappings for the 5 categories (Raw Material, Formulation, Packaging, Process, Packing/Shipment)
        let section = "";
        const val = rawType.trim().toLowerCase();
        const stepVal = step.toLowerCase();
        const modeVal = mode.toLowerCase();
        const detailText = detailVal.toLowerCase();
        const combinedText = (stepVal + " " + val + " " + modeVal + " " + detailText).toLowerCase();

        if (combinedText.includes("shipment") || combinedText.includes("shipping") || combinedText.includes("packing") || combinedText.includes("logistics") || combinedText.includes("transport") || combinedText.includes("pallet") || combinedText.includes("warehouse")) {
            section = "packing_shipment";
        } else if (combinedText.includes("packaging") || combinedText.includes("pkg") || combinedText.includes("bottle") || combinedText.includes("drum") || combinedText.includes("cartridge") || combinedText.includes("capping") || combinedText.includes("labeling") || combinedText.includes("container")) {
            section = "packaging";
        } else if (combinedText.includes("process") || combinedText.includes("operation") || combinedText.includes("mfg") || combinedText.includes("mixing") || combinedText.includes("mix") || combinedText.includes("blend") || combinedText.includes("blending") || combinedText.includes("reactor") || combinedText.includes("milling") || combinedText.includes("filtering")) {
            section = "process";
        } else if (combinedText.includes("formulation") || combinedText.includes("recipe") || combinedText.includes("ingredient") || combinedText.includes("stoichiometric") || combinedText.includes("ratio") || combinedText.includes("proportion")) {
            section = "formulation";
        } else {
            section = "raw_material";
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

const defaultProductFamilies = [
    { name: "Epoxy Adhesives", type: "product", description: "Two-component structural epoxy resins, conductive pastes, and encapsulants." },
    { name: "AG series", type: "product", description: "Silver-filled conductive adhesives for microelectronics and semiconductor packaging." },
    { name: "Polyurethane Adhesives", type: "product", description: "Flexible moisture-cure PU structural adhesives and laminating resins." },
    { name: "Acrylic Adhesives", type: "product", description: "Fast-curing structural acrylics, toughened methyl methacrylates (MMA), and UV curables." },
    { name: "Silicone Adhesives", type: "product", description: "High-temperature room-temperature vulcanizing (RTV) silicone sealants and thermal gels." }
];

const defaultProcessFamilies = [
    { name: "Mixing", type: "process", description: "Planetary mixing, high-shear dispersion, and vacuum degassing lines." },
    { name: "Packing", type: "process", description: "Automated syringe filling, tube packaging, cartridging, and nitrogen purge sealing." },
    { name: "Compounding", type: "process", description: "Twin-screw melt extrusion, filler pre-dispersion, and polymer compounding." },
    { name: "Dispensing", type: "process", description: "Automated robot dot/bead dispensing, jetting, and volumetric metering." }
];

function getFamilyType(fam) {
    if (fam && (fam.type === "product" || fam.type === "process")) return fam.type;
    const nameLower = (fam && fam.name ? fam.name : "").toLowerCase();
    if (nameLower.includes("mixing") || nameLower.includes("packing") || nameLower.includes("process") || nameLower.includes("degassing") || nameLower.includes("dispensing") || nameLower.includes("extrusion") || nameLower.includes("compounding") || nameLower.includes("logistics")) {
        return "process";
    }
    return "product";
}

function loadFamiliesDB() {
    try {
        const stored = localStorage.getItem("fmea_families");
        if (stored) {
            familiesDB = JSON.parse(stored);
            if (!Array.isArray(familiesDB) || familiesDB.length === 0) {
                familiesDB = [...defaultProductFamilies, ...defaultProcessFamilies];
                localStorage.setItem("fmea_families", JSON.stringify(familiesDB));
            } else {
                familiesDB.forEach(f => {
                    if (!f.type) f.type = getFamilyType(f);
                });
            }
        } else {
            familiesDB = [...defaultProductFamilies, ...defaultProcessFamilies];
            localStorage.setItem("fmea_families", JSON.stringify(familiesDB));
        }
    } catch (e) {
        console.error("Failed to load product or process families database", e);
        familiesDB = [...defaultProductFamilies, ...defaultProcessFamilies];
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
            optAll.textContent = "All Product & Process Families";
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
                opt.textContent = fam.name + (fam.type ? ` [${fam.type.toUpperCase()}]` : "");
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

function openCreateFamilyModal(type = "product") {
    const typeSelect = document.getElementById("family-type");
    if (typeSelect) {
        typeSelect.value = type;
    }
    onFamilyTypeSelectChange(type);
    const modal = document.getElementById("modal-family");
    if (modal) {
        modal.classList.add("active");
    }
}

function onFamilyTypeSelectChange(type) {
    const titleEl = document.getElementById("family-modal-title");
    const nameLabel = document.getElementById("family-name-label");
    const descLabel = document.getElementById("family-desc-label");
    const nameInput = document.getElementById("family-name");
    const descInput = document.getElementById("family-desc");

    if (type === "process") {
        if (titleEl) titleEl.textContent = "Register Process Family";
        if (nameLabel) nameLabel.textContent = "Process Family Name";
        if (descLabel) descLabel.textContent = "Description / Process & Equipment Attributes";
        if (nameInput) nameInput.placeholder = "e.g. Compounding, Mixing, Degassing, or Packaging";
        if (descInput) descInput.placeholder = "Enter machine capabilities, process parameters, or line parameters...";
    } else {
        if (titleEl) titleEl.textContent = "Register Product Family";
        if (nameLabel) nameLabel.textContent = "Product Family Name";
        if (descLabel) descLabel.textContent = "Description / Chemical & Material Attributes";
        if (nameInput) nameInput.placeholder = "e.g. Epoxy Adhesives or AG series";
        if (descInput) descInput.placeholder = "Enter key chemical resin types, material specifications, or performance attributes...";
    }
}

function renderFamiliesView() {
    const productTbody = document.getElementById("product-families-tbody");
    const productEmpty = document.getElementById("product-families-empty");
    const processTbody = document.getElementById("process-families-tbody");
    const processEmpty = document.getElementById("process-families-empty");

    if (productTbody) productTbody.innerHTML = "";
    if (processTbody) processTbody.innerHTML = "";

    const isHod = currentUser && currentUser.role === "hod";
    const dragColPrefix = isHod ? "" : `<span class="drag-handle" title="Click & Drag to Reorder Row"><i data-lucide="grip-vertical" style="width:14px; height:14px;"></i></span> `;

    const productFamilies = familiesDB.filter(f => getFamilyType(f) === "product");
    const processFamilies = familiesDB.filter(f => getFamilyType(f) === "process");

    // Render Product Families Table
    if (productFamilies.length === 0) {
        if (productEmpty) productEmpty.style.display = "block";
    } else {
        if (productEmpty) productEmpty.style.display = "none";
        productFamilies.forEach((fam, idx) => {
            const tr = document.createElement("tr");
            const deleteContent = isHod
                ? `<span style="color: var(--text-muted); font-size: 0.75rem;"><i data-lucide="lock" style="width:12px;height:12px;"></i> Locked</span>`
                : `<button class="btn-table-action delete-family-btn delete" title="Delete Product Family">
                       <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                   </button>`;
            tr.innerHTML = `
                <td style="text-align: center;">${dragColPrefix}<span class="row-index">${idx + 1}</span></td>
                <td><strong>${fam.name}</strong></td>
                <td>${fam.description || 'Auto-registered via library import.'}</td>
                <td style="text-align: center;">${deleteContent}</td>
            `;

            const btn = tr.querySelector(".delete-family-btn");
            if (btn) {
                btn.addEventListener("click", () => {
                    if (confirm(`Are you sure you want to delete the product family "${fam.name}"? Existing formulations linked to it will remain, but you won't be able to select it for new entries.`)) {
                        deleteFamily(fam.name);
                    }
                });
            }

            if (productTbody) productTbody.appendChild(tr);
        });
        makeTableRowsDraggable("product-families-tbody", familiesDB, saveFamiliesDB);
    }

    // Render Process Families Table
    if (processFamilies.length === 0) {
        if (processEmpty) processEmpty.style.display = "block";
    } else {
        if (processEmpty) processEmpty.style.display = "none";
        processFamilies.forEach((fam, idx) => {
            const tr = document.createElement("tr");
            const deleteContent = isHod
                ? `<span style="color: var(--text-muted); font-size: 0.75rem;"><i data-lucide="lock" style="width:12px;height:12px;"></i> Locked</span>`
                : `<button class="btn-table-action delete-family-btn delete" title="Delete Process Family">
                       <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                   </button>`;
            tr.innerHTML = `
                <td style="text-align: center;">${dragColPrefix}<span class="row-index">${idx + 1}</span></td>
                <td><strong>${fam.name}</strong></td>
                <td>${fam.description || 'Auto-registered via process operation library.'}</td>
                <td style="text-align: center;">${deleteContent}</td>
            `;

            const btn = tr.querySelector(".delete-family-btn");
            if (btn) {
                btn.addEventListener("click", () => {
                    if (confirm(`Are you sure you want to delete the process family "${fam.name}"? Existing process entries linked to it will remain, but you won't be able to select it for new entries.`)) {
                        deleteFamily(fam.name);
                    }
                });
            }

            if (processTbody) processTbody.appendChild(tr);
        });
        makeTableRowsDraggable("process-families-tbody", familiesDB, saveFamiliesDB);
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function deleteFamily(name) {
    const index = familiesDB.findIndex(f => f.name === name);
    if (index === -1) return;
    const removedType = getFamilyType(familiesDB[index]);
    familiesDB.splice(index, 1);
    saveFamiliesDB();
    renderFamiliesView();
    logGlobalActivity("Deleted Family", "Formulations", `Unregistered ${removedType} family "${name}".`);
    showToast(`${removedType === 'process' ? 'Process' : 'Product'} Family "${name}" unregistered.`, "success");
}

function handleCreateFamilySubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const nameInput = document.getElementById("family-name");
    const descInput = document.getElementById("family-desc");
    const typeSelect = document.getElementById("family-type");

    const name = nameInput ? nameInput.value.trim() : "";
    const desc = descInput ? descInput.value.trim() : "";
    const type = typeSelect ? typeSelect.value : "product";

    if (!name) return;

    if (familiesDB.some(f => f.name.toLowerCase() === name.toLowerCase())) {
        showToast("A family with this name is already registered.", "error");
        return;
    }

    familiesDB.push({
        name: name,
        type: type,
        description: desc
    });

    saveFamiliesDB();
    const form = document.getElementById("family-create-form");
    if (form) form.reset();
    closeModal("modal-family");
    logGlobalActivity("Registered Family", "Formulations", `Registered ${type} family "${name}".`);
    showToast(`Successfully registered ${type === 'process' ? 'Process' : 'Product'} Family "${name}".`, "success");
    renderFamiliesView();
}

window.openCreateFamilyModal = openCreateFamilyModal;
window.onFamilyTypeSelectChange = onFamilyTypeSelectChange;
window.handleCreateFamilySubmit = handleCreateFamilySubmit;

// ==================== 5-PILLAR MASTER DATA CENTER & LINK MATRIX LOGIC ====================
let masterProductsDB = JSON.parse(localStorage.getItem("fmea_master_products")) || [
    { family: "AG Series", code: "AG803", desc: "Silver-filled conductive paste for IC die attach and LED packaging.", status: "Active" },
    { family: "AG Series", code: "AG806", desc: "High thermal conductivity silver adhesive for power semiconductors.", status: "Active" },
    { family: "AG Series", code: "AG810", desc: "Ultra-fine pitch print conductive paste for microelectronics.", status: "Active" },
    { family: "OP Series", code: "OP886", desc: "UV & heat dual-cure optical adhesive for camera module alignment.", status: "Active" },
    { family: "OP Series", code: "OP996", desc: "Low outgassing optical clear adhesive for lidar & sensor lens.", status: "Active" },
    { family: "TH Series", code: "TH806", desc: "Non-reactive thermal gap filler for AI server module cooling.", status: "Active" }
];

let masterRMDB = JSON.parse(localStorage.getItem("fmea_master_rm")) || [
    { family: "Resin", code: "KER-828", desc: "Liquid Bisphenol-A Epoxy Resin (EEW 184-190 g/eq).", status: "Active" },
    { family: "Resin", code: "Resin-A", desc: "Cycloaliphatic Epoxy Resin for high weatherability.", status: "Active" },
    { family: "Hardener", code: "Jeffamine-D400", desc: "Polyetheramine curing agent for tough flexible formulation.", status: "Active" },
    { family: "Hardener", code: "Hardener-A", desc: "Substituted dicyandiamide latent accelerator.", status: "Active" },
    { family: "Filler", code: "Silica-A", desc: "Spherical fused silica filler (d50 = 3.5um) for low CTE.", status: "Active" },
    { family: "Filler", code: "Alumina-A", desc: "Thermally conductive spherical alumina powder (10um).", status: "Active" }
];

let masterAppDB = JSON.parse(localStorage.getItem("fmea_master_app")) || [
    { family: "Automotive", code: "APP-AUTO-001", desc: "Automotive Radar & Lidar Sensors (Low voiding & thermal shock -40°C to 150°C).", status: "Active" },
    { family: "Automotive", code: "APP-AUTO-002", desc: "Automotive Camera Module (Active alignment & ultra-low outgassing).", status: "Active" },
    { family: "Automotive", code: "APP-AUTO-003", desc: "Automotive Engine Control Unit ECU (Vibration resistance & moisture barrier).", status: "Active" },
    { family: "Optoelectronics", code: "APP-OPTO-001", desc: "Optocoupler & Photodiode (Refractive index match & high transparency).", status: "Active" },
    { family: "Optoelectronics", code: "APP-OPTO-002", desc: "High-power LED Package (High thermal dissipation & anti-yellowing).", status: "Active" },
    { family: "Data Center", code: "APP-DC-001", desc: "AI Server GPU/CPU Thermal Management (Ultra-low thermal resistance).", status: "Active" },
    { family: "Data Center", code: "APP-DC-002", desc: "Power Distribution Unit PDU Module Encapsulation.", status: "Active" }
];

let masterPkgDB = JSON.parse(localStorage.getItem("fmea_master_pkg")) || [
    { family: "Syringe", code: "PKG-SYR-0030", desc: "30cc EFD Nordson Black Syringe (Air-free centrifugal deaeration).", status: "Active" },
    { family: "Syringe", code: "PKG-SYR-0050", desc: "50cc EFD Amber Syringe for light sensitive adhesive.", status: "Active" },
    { family: "Bottle", code: "PKG-BOT-0100", desc: "100ml HDPE Black Opaque Bottle with tamper seal.", status: "Active" },
    { family: "Pail", code: "PKG-PAIL-0200", desc: "2L Stainless Steel Degassing Vacuum Pail.", status: "Active" }
];

let masterProcessDB = JSON.parse(localStorage.getItem("fmea_master_proc")) || [
    { family: "Epoxy Process", code: "PROC-EP-001", desc: "High-shear planetary mixing, -0.098MPa vacuum degassing, & automated syringe filling.", status: "Active" },
    { family: "Silicone Process", code: "PROC-SIL-001", desc: "Twin-shaft disperser mixing, screen filtration (200 mesh), & cartridge filling.", status: "Active" },
    { family: "UV Process", code: "PROC-UV-001", desc: "Darkroom yellow light weighing, nitrogen purge mixing, & yellow barrel packaging.", status: "Active" }
];

let productAppMatrixDB = JSON.parse(localStorage.getItem("fmea_product_app_matrix")) || [
    { prodCode: "AG803", appCode: "APP-AUTO-001", appDesc: "Automotive Sensor Assembly", status: "Qualified" },
    { prodCode: "AG803", appCode: "APP-AUTO-003", appDesc: "Automotive ECU Power Module", status: "Qualified" },
    { prodCode: "AG803", appCode: "APP-OPTO-001", appDesc: "Optocoupler Packaging", status: "Evaluation" },
    { prodCode: "OP996", appCode: "APP-OPTO-001", appDesc: "Optocoupler Packaging", status: "Qualified" },
    { prodCode: "OP996", appCode: "APP-OPTO-002", appDesc: "LED Camera Module Lens", status: "Qualified" },
    { prodCode: "TH806", appCode: "APP-DC-002", appDesc: "Data Center PDU Thermal Gap", status: "Qualified" }
];

function saveMasterDataDB() {
    localStorage.setItem("fmea_master_products", JSON.stringify(masterProductsDB));
    localStorage.setItem("fmea_master_rm", JSON.stringify(masterRMDB));
    localStorage.setItem("fmea_master_app", JSON.stringify(masterAppDB));
    localStorage.setItem("fmea_master_pkg", JSON.stringify(masterPkgDB));
    localStorage.setItem("fmea_master_proc", JSON.stringify(masterProcessDB));
    localStorage.setItem("fmea_product_app_matrix", JSON.stringify(productAppMatrixDB));

    // Automatically synchronize and preserve all Master Data updates into History Library
    syncMasterDataToHistoryLibrary();
}

function syncMasterDataToHistoryLibrary(updatedCode, origCode) {
    if (typeof libraryDB === "undefined" || !Array.isArray(libraryDB)) {
        try {
            libraryDB = JSON.parse(localStorage.getItem("fmea_library")) || [];
        } catch (e) {
            libraryDB = [];
        }
    }

    const prods = (typeof masterProductsDB !== "undefined" && Array.isArray(masterProductsDB))
        ? masterProductsDB
        : (JSON.parse(localStorage.getItem("fmea_master_products")) || []);
    const rms = (typeof masterRMDB !== "undefined" && Array.isArray(masterRMDB))
        ? masterRMDB
        : (JSON.parse(localStorage.getItem("fmea_master_rm")) || []);
    const apps = (typeof masterAppDB !== "undefined" && Array.isArray(masterAppDB))
        ? masterAppDB
        : (JSON.parse(localStorage.getItem("fmea_master_app")) || []);
    const pkgs = (typeof masterPkgDB !== "undefined" && Array.isArray(masterPkgDB))
        ? masterPkgDB
        : (JSON.parse(localStorage.getItem("fmea_master_pkg")) || []);
    const procs = (typeof masterProcessDB !== "undefined" && Array.isArray(masterProcessDB))
        ? masterProcessDB
        : (JSON.parse(localStorage.getItem("fmea_master_proc")) || []);
    const matrix = (typeof productAppMatrixDB !== "undefined" && Array.isArray(productAppMatrixDB))
        ? productAppMatrixDB
        : (JSON.parse(localStorage.getItem("fmea_product_app_matrix")) || []);

    let hasChanges = false;

    // Helper to upsert a master item into libraryDB
    const upsertLibraryItem = (code, family, desc, section, defaultFunction, defaultMode, defaultEffect, defaultCause, defaultPrevention, defaultDetection, defaultAction) => {
        if (!code) return;

        // Check if an entry already exists for this master code in this section
        let existing = libraryDB.find(l => 
            (origCode && (l.masterCode === origCode || (l.step === origCode && l.section === section))) ||
            (l.masterCode && l.masterCode === code) || 
            (l.step === code && l.section === section)
        );

        if (existing) {
            const cleanDesc = desc || existing.detail || code;
            const cleanFamily = family || existing.category || "General";
            if (existing.detail !== cleanDesc || existing.category !== cleanFamily || existing.masterCode !== code || existing.step !== code) {
                existing.step = code;
                existing.detail = cleanDesc;
                existing.category = cleanFamily;
                existing.masterCode = code;
                existing.source = "Master Data";
                existing.lastUpdated = new Date().toLocaleString();
                hasChanges = true;
            }
        } else {
            const newItem = {
                id: "lib-master-" + code.toLowerCase().replace(/[^a-z0-9_-]/g, "-") + "-" + Date.now(),
                masterCode: code,
                category: family || "General",
                section: section,
                step: code,
                function: defaultFunction || "Specification Function",
                detail: desc || code,
                characteristic: "CTQ",
                mode: defaultMode || "Parameter drift or specification tolerance breach",
                effect: defaultEffect || "Degraded adhesive bond reliability or quality rejection",
                sev: 7,
                cause: defaultCause || "Material variation, storage humidity, or process deviation",
                occ: 3,
                prevention: defaultPrevention || "Standardized storage, handling controls & validated procedures",
                detection_controls: defaultDetection || "Automated in-line sensor & analytical QA verification",
                det: 3,
                action: defaultAction || "Implement automated SPC monitoring and periodic capability audit",
                resp: "Quality & Process Engineering",
                result: "Active Master Reference Standard",
                result_date: new Date().toISOString().split("T")[0],
                result_sev: 7,
                result_occ: 2,
                result_det: 2,
                concern: "Master Data synchronization item",
                happened: "No",
                source: "Master Data",
                lastUpdated: new Date().toLocaleString()
            };
            libraryDB.push(newItem);
            hasChanges = true;
        }
    };

    // 1. Product Master -> Formulation Section
    if (Array.isArray(prods)) {
        prods.forEach(item => {
            upsertLibraryItem(
                item.code,
                item.family,
                item.desc,
                "formulation",
                "Die Attach Electrical & Thermal Conduction Paste",
                "Silver filler agglomeration or paste viscosity drift",
                "High electrical contact resistance and thermal hotspot failure",
                "Insufficient vacuum planetary mixing or thermal exposure",
                "Standardized dual-asymmetric planetary vacuum mixing cycle",
                "Four-point probe electrical volume resistivity test & rheometer check",
                "Enforce automated mixer cycle timer and temperature limits"
            );
        });
    }

    // 2. Raw Material Master -> Raw Material Section
    if (Array.isArray(rms)) {
        rms.forEach(item => {
            upsertLibraryItem(
                item.code,
                item.family,
                item.desc,
                "raw_material",
                "Active Epoxy / Amine / Filler Formulation Constituent",
                "Moisture absorption or supplier batch EEW variance",
                "Incomplete crosslinking, reduced glass transition Tg, voiding",
                "Storage drum moisture seal integrity degradation in warehouse",
                "Dry nitrogen gas purging blankets and desiccated drum caps",
                "Incoming Karl Fischer moisture titration (max 0.05%) and FTIR identity",
                "Enforce automated supplier COA verification and incoming quarantine lock"
            );
        });
    }

    // 3. Application Master -> Application Section
    if (Array.isArray(apps)) {
        apps.forEach(item => {
            upsertLibraryItem(
                item.code,
                item.family,
                item.desc,
                "application",
                "Automotive / Opto / Server Substrate Bonding Interface",
                "Interfacial delamination under temperature cycling (-40°C to 150°C)",
                "Intermittent sensor disconnect or thermal interface resistance increase",
                "CTE mismatch between silicon die and metal leadframe substrate",
                "Flexibilized low-modulus backbone chemistry with high fracture toughness",
                "Scanning Acoustic Microscopy (C-SAM) acoustic void check and die shear",
                "Perform 1,000 hrs thermal shock test reliability qualification"
            );
        });
    }

    // 4. Packaging Master -> Packaging Section
    if (Array.isArray(pkgs)) {
        pkgs.forEach(item => {
            upsertLibraryItem(
                item.code,
                item.family,
                item.desc,
                "packaging",
                "Precision Dispensing Syringe & Degassing Container",
                "Air bubble void entrapment in syringe barrel or piston seal leak",
                "Dispense volume inconsistency, tailing, or pneumatic pressure surge",
                "Ambient filling without high-speed centrifugal vacuum deaeration",
                "Centrifugal vacuum deaeration at 2000 RPM under -0.098 MPa",
                "Automated optical camera bubble void inspection",
                "Standardize amber/black UV-barrier syringe barrels"
            );
        });
    }

    // 5. Process Master -> Process Section
    if (Array.isArray(procs)) {
        procs.forEach(item => {
            upsertLibraryItem(
                item.code,
                item.family,
                item.desc,
                "process",
                "Planetary Shear Mixing, Vacuum Degassing & Automated Filling",
                "Vacuum chamber pressure leak (> -0.095 MPa) or shear overheating",
                "Micro-void inclusions in formulated paste or pre-cure viscosity jump",
                "Chamber O-ring seal wear or cooling jacket temperature failure",
                "Daily vacuum pressure decay leak-rate check and chilled water jacket",
                "Continuous digital Pirani gauge monitoring with automated PLC interlock",
                "Schedule preventive seal replacement every 500 mixing cycles"
            );
        });
    }

    // 6. Qualification Matrix -> Application Section
    if (Array.isArray(matrix)) {
        matrix.forEach(link => {
            const matrixCode = `${link.prodCode} ⇄ ${link.appCode}`;
            upsertLibraryItem(
                matrixCode,
                link.status === "Qualified" ? "Qualified Application" : "Evaluation Application",
                link.appDesc || `${link.prodCode} qualified for ${link.appCode}`,
                "application",
                `Qualification Matrix Standard [${link.status}]`,
                "Adhesive / substrate joint incompatibility under operating environment",
                "Reliability failure under operating thermal shock or mechanical vibration",
                "Process window drift or surface energy mismatch on assembly line",
                "Pre-qualification surface plasma treatment and validated cure schedule",
                "Accelerated life testing (HAST/HTS) and cross-sectional SEM analysis",
                "Maintain digital qualification certificate in Master Registry"
            );
        });
    }

    if (hasChanges) {
        localStorage.setItem("fmea_library", JSON.stringify(libraryDB));
        const activePanel = document.querySelector(".view-panel.active");
        if (activePanel && activePanel.id === "view-library" && typeof renderLibraryView === "function") {
            renderLibraryView();
        }
    }
}
window.syncMasterDataToHistoryLibrary = syncMasterDataToHistoryLibrary;

function switchMasterTab(tabKey) {
    const tabs = ['flow', 'prod', 'rm', 'app', 'pkg', 'proc', 'matrix'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-master-${t}`);
        const panel = document.getElementById(`master-panel-${t}`);
        if (btn) {
            if (t === tabKey) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
        if (panel) {
            if (t === tabKey) {
                panel.style.display = 'block';
            } else {
                panel.style.display = 'none';
            }
        }
    });

    // Synchronize dropdown bar
    const dropdown = document.getElementById('master-tab-dropdown');
    if (dropdown && dropdown.value !== tabKey) {
        dropdown.value = tabKey;
    }

    // Dynamic icon and step count
    const iconsMap = {
        flow: 'git-fork',
        prod: 'layers',
        rm: 'flask-conical',
        app: 'target',
        pkg: 'package',
        proc: 'activity',
        matrix: 'link'
    };
    const iconEl = document.getElementById('master-dropdown-icon');
    if (iconEl && iconsMap[tabKey]) {
        iconEl.setAttribute('data-lucide', iconsMap[tabKey]);
    }

    const currentIdx = tabs.indexOf(tabKey);
    const indicatorEl = document.getElementById('master-step-indicator');
    if (indicatorEl && currentIdx !== -1) {
        indicatorEl.textContent = `${currentIdx + 1} / ${tabs.length}`;
    }

    renderMasterTables();
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function stepMasterTab(delta) {
    const tabs = ['flow', 'prod', 'rm', 'app', 'pkg', 'proc', 'matrix'];
    const dropdown = document.getElementById('master-tab-dropdown');
    const currentVal = dropdown ? dropdown.value : 'flow';
    let idx = tabs.indexOf(currentVal);
    if (idx === -1) idx = 0;
    idx = (idx + delta + tabs.length) % tabs.length;
    switchMasterTab(tabs[idx]);
}
window.stepMasterTab = stepMasterTab;

function makeTableRowsDraggable(tbodyId, dbArray, saveAndRenderFn) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody || (currentUser && currentUser.role === "hod")) return;

    let draggedIndex = null;

    Array.from(tbody.querySelectorAll("tr")).forEach((tr, index) => {
        tr.setAttribute("draggable", "true");

        tr.addEventListener("dragstart", (e) => {
            draggedIndex = index;
            tr.classList.add("row-dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", index);
        });

        tr.addEventListener("dragend", () => {
            tr.classList.remove("row-dragging");
            tbody.querySelectorAll("tr").forEach(r => {
                r.classList.remove("drag-over-top", "drag-over-bottom");
            });
        });

        tr.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";

            const rect = tr.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            tbody.querySelectorAll("tr").forEach(r => r.classList.remove("drag-over-top", "drag-over-bottom"));

            if (e.clientY < midpoint) {
                tr.classList.add("drag-over-top");
            } else {
                tr.classList.add("drag-over-bottom");
            }
        });

        tr.addEventListener("dragleave", () => {
            tr.classList.remove("drag-over-top", "drag-over-bottom");
        });

        tr.addEventListener("drop", (e) => {
            e.preventDefault();
            tr.classList.remove("drag-over-top", "drag-over-bottom");

            if (draggedIndex === null || draggedIndex === index) return;

            const [movedItem] = dbArray.splice(draggedIndex, 1);
            dbArray.splice(index, 0, movedItem);

            if (saveAndRenderFn) {
                saveAndRenderFn();
            }
            showToast("Row reordered successfully with mouse drag!", "success");
        });
    });
}

function renderMasterTables() {
    const isHod = currentUser && currentUser.role === "hod";

    // Toggle header button visibility
    const addCodeBtn = document.getElementById("btn-master-new-code");
    if (addCodeBtn) {
        addCodeBtn.style.display = isHod ? "none" : "inline-flex";
    }
    const addMatrixBtn = document.getElementById("btn-master-new-matrix");
    if (addMatrixBtn) {
        addMatrixBtn.style.display = isHod ? "none" : "inline-flex";
    }
    document.querySelectorAll(".master-reg-btn").forEach(btn => {
        btn.style.display = isHod ? "none" : "inline-flex";
    });

    // Toggle status badge indicator
    const masterStatusBadge = document.getElementById("master-status-badge");
    if (masterStatusBadge) {
        if (isHod) {
            masterStatusBadge.innerHTML = `<i data-lucide="lock" style="width: 14px; height: 14px; color: #ea580c;"></i> Read-Only HOD View`;
            masterStatusBadge.style.background = "rgba(234, 88, 12, 0.08)";
            masterStatusBadge.style.color = "#ea580c";
            masterStatusBadge.style.borderColor = "rgba(234, 88, 12, 0.2)";
        } else {
            masterStatusBadge.innerHTML = `<i data-lucide="shield-check" style="width: 14px; height: 14px; color: #4f46e5;"></i> Operator Active DB`;
            masterStatusBadge.style.background = "rgba(99, 102, 241, 0.08)";
            masterStatusBadge.style.color = "#4f46e5";
            masterStatusBadge.style.borderColor = "rgba(99, 102, 241, 0.2)";
        }
    }

    const dragColPrefix = isHod ? "" : `<span class="drag-handle" title="Click & Drag to Reorder Row"><i data-lucide="grip-vertical" style="width:14px; height:14px;"></i></span> `;

    const actionColContent = (pillar, idx, fnName = "deleteMasterItem") => {
        if (isHod) {
            return `<span style="color: var(--text-muted); font-size: 0.75rem;"><i data-lucide="lock" style="width:12px;height:12px;"></i> Locked</span>`;
        }
        return `
            <div class="table-ops-group">
                <button class="btn-table-action edit" title="Edit Master Code & Description" onclick="openEditMasterCodeModal('${pillar}', ${idx})">
                    <i data-lucide="edit-3"></i>
                </button>
                <button class="btn-table-action delete" title="Delete Item" onclick="${fnName}('${pillar}', ${idx})">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `;
    };
    const deleteColContent = actionColContent;

    // 1. Render Product Master Table
    const prodTbody = document.getElementById("master-prod-tbody");
    if (prodTbody) {
        prodTbody.innerHTML = "";
        masterProductsDB.forEach((item, idx) => {
            const tr = document.createElement("tr");
            const safeDesc = encodeURIComponent(item.desc || "");
            tr.innerHTML = `
                <td style="text-align: center;"><span class="drag-handle-cell">${dragColPrefix}<span class="row-index">${idx + 1}</span></span></td>
                <td><span class="master-family-pill family-prod">${item.family}</span></td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('prod', '${item.code}', '${safeDesc}')" title="Click to locate ${item.code} in 1. Product Master">
                    <div class="clickable-code-wrapper">
                        <span class="code-pill code-prod">${item.code}</span>
                        <i data-lucide="arrow-up-right" class="code-link-icon" style="width: 12px; height: 12px;"></i>
                    </div>
                </td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('prod', '${item.code}', '${safeDesc}')" title="Click to locate ${item.code} in 1. Product Master">
                    <span class="clickable-desc-text">${item.desc || '-'}</span>
                </td>
                <td style="text-align: center;"><span class="status-badge-soft status-active"><span class="status-dot"></span>${item.status || 'Active'}</span></td>
                <td style="text-align: center;">${deleteColContent('prod', idx)}</td>
            `;
            prodTbody.appendChild(tr);
        });
        makeTableRowsDraggable("master-prod-tbody", masterProductsDB, saveMasterDataDB);
    }

    // 2. Render RM Master Table
    const rmTbody = document.getElementById("master-rm-tbody");
    if (rmTbody) {
        rmTbody.innerHTML = "";
        masterRMDB.forEach((item, idx) => {
            const tr = document.createElement("tr");
            const safeDesc = encodeURIComponent(item.desc || "");
            tr.innerHTML = `
                <td style="text-align: center;"><span class="drag-handle-cell">${dragColPrefix}<span class="row-index">${idx + 1}</span></span></td>
                <td><span class="master-family-pill family-rm">${item.family}</span></td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('rm', '${item.code}', '${safeDesc}')" title="Click to locate ${item.code} in 2. Raw Material Master">
                    <div class="clickable-code-wrapper">
                        <span class="code-pill code-rm">${item.code}</span>
                        <i data-lucide="arrow-up-right" class="code-link-icon" style="width: 12px; height: 12px;"></i>
                    </div>
                </td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('rm', '${item.code}', '${safeDesc}')" title="Click to locate ${item.code} in 2. Raw Material Master">
                    <span class="clickable-desc-text">${item.desc || '-'}</span>
                </td>
                <td style="text-align: center;"><span class="status-badge-soft status-active"><span class="status-dot"></span>${item.status || 'Active'}</span></td>
                <td style="text-align: center;">${deleteColContent('rm', idx)}</td>
            `;
            rmTbody.appendChild(tr);
        });
        makeTableRowsDraggable("master-rm-tbody", masterRMDB, saveMasterDataDB);
    }

    // 3. Render App Master Table
    const appTbody = document.getElementById("master-app-tbody");
    if (appTbody) {
        appTbody.innerHTML = "";
        masterAppDB.forEach((item, idx) => {
            const tr = document.createElement("tr");
            const safeDesc = encodeURIComponent(item.desc || "");
            tr.innerHTML = `
                <td style="text-align: center;"><span class="drag-handle-cell">${dragColPrefix}<span class="row-index">${idx + 1}</span></span></td>
                <td><span class="master-family-pill family-app">${item.family}</span></td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('app', '${item.code}', '${safeDesc}')" title="Click to locate ${item.code} in 3. Application Master">
                    <div class="clickable-code-wrapper">
                        <span class="code-pill code-app">${item.code}</span>
                        <i data-lucide="arrow-up-right" class="code-link-icon" style="width: 12px; height: 12px;"></i>
                    </div>
                </td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('app', '${item.code}', '${safeDesc}')" title="Click to locate ${item.code} in 3. Application Master">
                    <span class="clickable-desc-text">${item.desc || '-'}</span>
                </td>
                <td style="text-align: center;"><span class="status-badge-soft status-active"><span class="status-dot"></span>${item.status || 'Active'}</span></td>
                <td style="text-align: center;">${deleteColContent('app', idx)}</td>
            `;
            appTbody.appendChild(tr);
        });
        makeTableRowsDraggable("master-app-tbody", masterAppDB, saveMasterDataDB);
    }

    // 4. Render Pkg Master Table
    const pkgTbody = document.getElementById("master-pkg-tbody");
    if (pkgTbody) {
        pkgTbody.innerHTML = "";
        masterPkgDB.forEach((item, idx) => {
            const tr = document.createElement("tr");
            const safeDesc = encodeURIComponent(item.desc || "");
            tr.innerHTML = `
                <td style="text-align: center;"><span class="drag-handle-cell">${dragColPrefix}<span class="row-index">${idx + 1}</span></span></td>
                <td><span class="master-family-pill family-pkg">${item.family}</span></td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('pkg', '${item.code}', '${safeDesc}')" title="Click to locate ${item.code} in 4. Packaging Master">
                    <div class="clickable-code-wrapper">
                        <span class="code-pill code-pkg">${item.code}</span>
                        <i data-lucide="arrow-up-right" class="code-link-icon" style="width: 12px; height: 12px;"></i>
                    </div>
                </td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('pkg', '${item.code}', '${safeDesc}')" title="Click to locate ${item.code} in 4. Packaging Master">
                    <span class="clickable-desc-text">${item.desc || '-'}</span>
                </td>
                <td style="text-align: center;"><span class="status-badge-soft status-active"><span class="status-dot"></span>${item.status || 'Active'}</span></td>
                <td style="text-align: center;">${deleteColContent('pkg', idx)}</td>
            `;
            pkgTbody.appendChild(tr);
        });
        makeTableRowsDraggable("master-pkg-tbody", masterPkgDB, saveMasterDataDB);
    }

    // 5. Render Process Master Table
    const procTbody = document.getElementById("master-proc-tbody");
    if (procTbody) {
        procTbody.innerHTML = "";
        masterProcessDB.forEach((item, idx) => {
            const tr = document.createElement("tr");
            const safeDesc = encodeURIComponent(item.desc || "");
            tr.innerHTML = `
                <td style="text-align: center;"><span class="drag-handle-cell">${dragColPrefix}<span class="row-index">${idx + 1}</span></span></td>
                <td><span class="master-family-pill family-proc">${item.family}</span></td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('proc', '${item.code}', '${safeDesc}')" title="Click to locate ${item.code} in 5. Process Master">
                    <div class="clickable-code-wrapper">
                        <span class="code-pill code-proc">${item.code}</span>
                        <i data-lucide="arrow-up-right" class="code-link-icon" style="width: 12px; height: 12px;"></i>
                    </div>
                </td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('proc', '${item.code}', '${safeDesc}')" title="Click to locate ${item.code} in 5. Process Master">
                    <span class="clickable-desc-text">${item.desc || '-'}</span>
                </td>
                <td style="text-align: center;"><span class="status-badge-soft status-active"><span class="status-dot"></span>${item.status || 'Active'}</span></td>
                <td style="text-align: center;">${deleteColContent('proc', idx)}</td>
            `;
            procTbody.appendChild(tr);
        });
        makeTableRowsDraggable("master-proc-tbody", masterProcessDB, saveMasterDataDB);
    }

    // 6. Render Qualification Matrix Table
    const matrixTbody = document.getElementById("master-matrix-tbody");
    if (matrixTbody) {
        matrixTbody.innerHTML = "";
        productAppMatrixDB.forEach((link, idx) => {
            const tr = document.createElement("tr");
            const statusClass = link.status === "Qualified" ? "badge-approved" : (link.status === "Evaluation" ? "badge-in-review" : "badge-draft");
            const matrixDelete = isHod
                ? `<span style="color: var(--text-muted); font-size: 0.75rem;"><i data-lucide="lock" style="width:12px;height:12px;"></i> Locked</span>`
                : `
                    <div style="display: inline-flex; gap: 4px; align-items: center; justify-content: center;">
                        <button class="btn-table-action edit" title="Edit Qualification Link" onclick="openEditMatrixLinkModal(${idx})">
                            <i data-lucide="edit-3" style="width:13px; height:13px; color: var(--primary-color);"></i>
                        </button>
                        <button class="btn-table-action delete" title="Delete Qualification Link" onclick="deleteMatrixLink(${idx})">
                            <i data-lucide="trash-2" style="width:13px; height:13px;"></i>
                        </button>
                    </div>
                `;
            const safeAppDesc = encodeURIComponent(link.appDesc || "");
            tr.innerHTML = `
                <td style="text-align: center;">${dragColPrefix}<span class="row-index">${idx + 1}</span></td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('prod', '${link.prodCode}', '${safeAppDesc}')" title="Click to locate ${link.prodCode} in 1. Product Master">
                    <div class="clickable-code-wrapper">
                        <strong class="clickable-code-text" style="color: #2563eb; font-weight:600;">${link.prodCode}</strong>
                        <i data-lucide="arrow-up-right" class="code-link-icon" style="width: 12px; height: 12px;"></i>
                    </div>
                </td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('app', '${link.appCode}', '${safeAppDesc}')" title="Click to locate ${link.appCode} in 3. Application Master">
                    <div class="clickable-code-wrapper">
                        <strong class="clickable-code-text" style="color: #0284c7; font-weight:600;">${link.appCode}</strong>
                        <i data-lucide="arrow-up-right" class="code-link-icon" style="width: 12px; height: 12px;"></i>
                    </div>
                </td>
                <td class="master-clickable-cell" onclick="locateMasterItemInFMEA('matrix', '${link.prodCode}', '${safeAppDesc}')" title="Click to locate ${link.prodCode} (${link.appCode}) in 3. Application Master">
                    <span class="clickable-desc-text">${link.appDesc || '-'}</span>
                    <i data-lucide="arrow-up-right" class="desc-link-icon" style="width: 12px; height: 12px;"></i>
                </td>
                <td style="text-align: center;"><span class="status-badge ${statusClass}">${link.status}</span></td>
                <td style="text-align: center;">${matrixDelete}</td>
            `;
            matrixTbody.appendChild(tr);
        });
        makeTableRowsDraggable("master-matrix-tbody", productAppMatrixDB, saveMasterDataDB);
    }

    renderFamiliesView();
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

function handleSmartMasterRegister(targetPillar) {
    if (targetPillar) {
        if (targetPillar === 'matrix') {
            openCreateMatrixLinkModal();
            return;
        }
        openCreateMasterCodeModal(targetPillar);
        return;
    }
    const activeTabBtn = document.querySelector(".sub-tabs-container .sub-tab-btn.active");
    let pillar = "product";
    if (activeTabBtn) {
        const id = activeTabBtn.id || "";
        if (id.includes("-rm")) pillar = "rm";
        else if (id.includes("-app")) pillar = "app";
        else if (id.includes("-pkg")) pillar = "pkg";
        else if (id.includes("-proc")) pillar = "proc";
        else if (id.includes("-matrix")) {
            openCreateMatrixLinkModal();
            return;
        }
        else if (id.includes("-prod") || id.includes("-flow")) pillar = "product";
    }
    openCreateMasterCodeModal(pillar);
}

function openCreateMasterCodeModal(pillar = "product") {
    if (currentUser && currentUser.role === "hod") {
        showToast("Master Data registration and modification is restricted to Operator role.", "warning");
        return;
    }
    const editIndexField = document.getElementById("master-code-edit-index");
    if (editIndexField) editIndexField.value = "";
    const origCodeField = document.getElementById("master-code-edit-orig-code");
    if (origCodeField) origCodeField.value = "";
    const origPillarField = document.getElementById("master-code-edit-orig-pillar");
    if (origPillarField) origPillarField.value = "";

    const titleEl = document.getElementById("master-code-modal-title");
    if (titleEl) titleEl.textContent = "Register Master Item / Code";
    const submitBtnSpan = document.getElementById("master-code-submit-label");
    if (submitBtnSpan) submitBtnSpan.textContent = "Register Master Code";

    const pillarSelect = document.getElementById("master-code-pillar");
    if (pillarSelect) {
        pillarSelect.value = pillar;
        pillarSelect.disabled = false;
    }
    onMasterPillarSelectChange(pillar);
    
    const codeInput = document.getElementById("master-code-input");
    if (codeInput) codeInput.value = "";
    const descInput = document.getElementById("master-code-desc");
    if (descInput) descInput.value = "";

    const modal = document.getElementById("modal-master-code");
    if (modal) modal.classList.add("active");
}

function openEditMasterCodeModal(pillar, index) {
    if (currentUser && currentUser.role === "hod") {
        showToast("Master Data registration and modification is restricted to Operator role.", "warning");
        return;
    }
    let targetArray = masterProductsDB;
    if (pillar === "rm") targetArray = masterRMDB;
    else if (pillar === "app") targetArray = masterAppDB;
    else if (pillar === "pkg") targetArray = masterPkgDB;
    else if (pillar === "proc") targetArray = masterProcessDB;

    const item = targetArray[index];
    if (!item) return;

    const editIndexField = document.getElementById("master-code-edit-index");
    if (editIndexField) editIndexField.value = index;
    const origCodeField = document.getElementById("master-code-edit-orig-code");
    if (origCodeField) origCodeField.value = item.code;
    const origPillarField = document.getElementById("master-code-edit-orig-pillar");
    if (origPillarField) origPillarField.value = pillar;

    const titleEl = document.getElementById("master-code-modal-title");
    if (titleEl) titleEl.textContent = `Edit Master Item (${item.code})`;
    const submitBtnSpan = document.getElementById("master-code-submit-label");
    if (submitBtnSpan) submitBtnSpan.textContent = "Save Changes & Sync to Library";

    const pillarSelect = document.getElementById("master-code-pillar");
    if (pillarSelect) {
        pillarSelect.value = pillar;
        pillarSelect.disabled = true;
    }
    onMasterPillarSelectChange(pillar);

    const famSelect = document.getElementById("master-code-family");
    if (famSelect && item.family) famSelect.value = item.family;

    const codeInput = document.getElementById("master-code-input");
    if (codeInput) codeInput.value = item.code;
    const descInput = document.getElementById("master-code-desc");
    if (descInput) descInput.value = item.desc || "";

    const modal = document.getElementById("modal-master-code");
    if (modal) modal.classList.add("active");
}
window.openEditMasterCodeModal = openEditMasterCodeModal;

function onMasterPillarSelectChange(pillar) {
    const familySelect = document.getElementById("master-code-family");
    if (!familySelect) return;

    familySelect.innerHTML = "";
    let familyOptions = [];

    if (pillar === "product") {
        familyOptions = ["AG Series", "OP Series", "EN Series", "TH Series", "Custom Product Family"];
    } else if (pillar === "rm") {
        familyOptions = ["Resin", "Hardener", "Filler", "Catalyst", "Other RM Family"];
    } else if (pillar === "app") {
        familyOptions = ["Automotive", "Optoelectronics", "Data Center", "Consumer Electronics", "Semiconductor", "Other App Family"];
    } else if (pillar === "pkg") {
        familyOptions = ["Syringe", "Bottle", "Pail", "Film", "Cartridge", "Other Packaging Family"];
    } else if (pillar === "proc") {
        familyOptions = ["Epoxy Process", "Silicone Process", "UV Process", "Other Process Family"];
    }

    familyOptions.forEach(fam => {
        const opt = document.createElement("option");
        opt.value = fam;
        opt.textContent = fam;
        familySelect.appendChild(opt);
    });
}

function handleCreateMasterCodeSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (currentUser && currentUser.role === "hod") {
        showToast("Master Data registration and modification is restricted to Operator role.", "warning");
        return;
    }

    const editIndexField = document.getElementById("master-code-edit-index");
    const editIndex = editIndexField ? editIndexField.value : "";
    const origCodeField = document.getElementById("master-code-edit-orig-code");
    const origCode = origCodeField ? origCodeField.value : "";
    const pillarSelect = document.getElementById("master-code-pillar");
    const pillar = pillarSelect.value;
    const family = document.getElementById("master-code-family").value;
    const code = document.getElementById("master-code-input").value.trim();
    const desc = document.getElementById("master-code-desc").value.trim();

    if (!code) return;

    let targetArray = masterProductsDB;
    if (pillar === "rm") targetArray = masterRMDB;
    else if (pillar === "app") targetArray = masterAppDB;
    else if (pillar === "pkg") targetArray = masterPkgDB;
    else if (pillar === "proc") targetArray = masterProcessDB;

    if (editIndex !== "" && !isNaN(parseInt(editIndex, 10))) {
        const idx = parseInt(editIndex, 10);
        if (targetArray[idx]) {
            targetArray[idx].family = family;
            targetArray[idx].code = code;
            targetArray[idx].desc = desc;
        }
        // Update matrix references if code was renamed
        if (origCode && origCode !== code) {
            if (pillar === "product") {
                productAppMatrixDB.forEach(l => {
                    if (l.prodCode === origCode) l.prodCode = code;
                });
            } else if (pillar === "app") {
                productAppMatrixDB.forEach(l => {
                    if (l.appCode === origCode) l.appCode = code;
                });
            }
        }
        saveMasterDataDB();
        closeModal("modal-master-code");
        document.getElementById("form-master-code").reset();
        if (pillarSelect) pillarSelect.disabled = false;
        renderMasterTables();
        showToast(`Master Item "${code}" updated & preserved to History Library.`, "success");
        return;
    }

    const newItem = { family, code, desc, status: "Active" };
    targetArray.push(newItem);

    saveMasterDataDB();
    closeModal("modal-master-code");
    document.getElementById("form-master-code").reset();
    if (pillarSelect) pillarSelect.disabled = false;
    showToast(`Successfully registered Master Item "${code}" under ${family} (Synced to History Library).`, "success");
    switchMasterTab(pillar);
}

function openCreateMatrixLinkModal() {
    if (currentUser && currentUser.role === "hod") {
        showToast("Master Data qualification linking is restricted to Operator role.", "warning");
        return;
    }
    const editIndexField = document.getElementById("matrix-edit-index");
    if (editIndexField) editIndexField.value = "";

    const titleEl = document.getElementById("matrix-modal-title");
    if (titleEl) titleEl.textContent = "Link Product Code to Customer Application";
    const submitBtn = document.getElementById("matrix-submit-label");
    if (submitBtn) submitBtn.textContent = "Save Product-App Link";

    const prodSelect = document.getElementById("matrix-prod-code");
    const appSelect = document.getElementById("matrix-app-code");

    if (prodSelect) {
        prodSelect.innerHTML = "";
        masterProductsDB.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.code;
            opt.textContent = `${p.code} (${p.family})`;
            prodSelect.appendChild(opt);
        });
    }

    if (appSelect) {
        appSelect.innerHTML = "";
        masterAppDB.forEach(a => {
            const opt = document.createElement("option");
            opt.value = a.code;
            opt.textContent = `${a.code} - ${a.desc.substring(0, 35)}...`;
            appSelect.appendChild(opt);
        });
    }

    const modal = document.getElementById("modal-matrix-link");
    if (modal) modal.classList.add("active");
}

function openEditMatrixLinkModal(index) {
    if (currentUser && currentUser.role === "hod") {
        showToast("Master Data qualification linking is restricted to Operator role.", "warning");
        return;
    }
    const link = productAppMatrixDB[index];
    if (!link) return;

    openCreateMatrixLinkModal();

    const titleEl = document.getElementById("matrix-modal-title");
    if (titleEl) titleEl.textContent = `Edit Qualification Link (${link.prodCode} ⇄ ${link.appCode})`;
    const submitBtn = document.getElementById("matrix-submit-label");
    if (submitBtn) submitBtn.textContent = "Save Changes & Sync to Library";

    const editIndexField = document.getElementById("matrix-edit-index");
    if (editIndexField) editIndexField.value = index;

    const prodSelect = document.getElementById("matrix-prod-code");
    if (prodSelect) prodSelect.value = link.prodCode;

    const appSelect = document.getElementById("matrix-app-code");
    if (appSelect) appSelect.value = link.appCode;

    const statusSelect = document.getElementById("matrix-status");
    if (statusSelect) statusSelect.value = link.status;
}
window.openEditMatrixLinkModal = openEditMatrixLinkModal;

function handleCreateMatrixLinkSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (currentUser && currentUser.role === "hod") {
        showToast("Master Data qualification linking is restricted to Operator role.", "warning");
        return;
    }

    const editIndexField = document.getElementById("matrix-edit-index");
    const editIndex = editIndexField ? editIndexField.value : "";
    const prodCode = document.getElementById("matrix-prod-code").value;
    const appCode = document.getElementById("matrix-app-code").value;
    const status = document.getElementById("matrix-status").value;

    const matchedApp = masterAppDB.find(a => a.code === appCode);
    const appDesc = matchedApp ? matchedApp.desc : appCode;

    if (editIndex !== "" && !isNaN(parseInt(editIndex, 10))) {
        const idx = parseInt(editIndex, 10);
        if (productAppMatrixDB[idx]) {
            productAppMatrixDB[idx] = { prodCode, appCode, appDesc, status };
        }
        saveMasterDataDB();
        closeModal("modal-matrix-link");
        document.getElementById("form-matrix-link").reset();
        renderMasterTables();
        showToast(`Updated qualification link for ${prodCode} ⇄ ${appCode} (History Library updated).`, "success");
        return;
    }

    productAppMatrixDB.push({ prodCode, appCode, appDesc, status });
    saveMasterDataDB();

    closeModal("modal-matrix-link");
    document.getElementById("form-matrix-link").reset();
    showToast(`Linked ${prodCode} to ${appCode} (${status}). Preserved to History Library.`, "success");
    switchMasterTab("matrix");
}

function deleteMasterItem(pillar, index) {
    if (currentUser && currentUser.role === "hod") {
        showToast("Master Data deletion is restricted to Operator role.", "warning");
        return;
    }
    if (!confirm("Are you sure you want to remove this Master Code?")) return;
    if (pillar === "product") masterProductsDB.splice(index, 1);
    else if (pillar === "rm") masterRMDB.splice(index, 1);
    else if (pillar === "app") masterAppDB.splice(index, 1);
    else if (pillar === "pkg") masterPkgDB.splice(index, 1);
    else if (pillar === "proc") masterProcessDB.splice(index, 1);

    saveMasterDataDB();
    renderMasterTables();
    showToast("Master Item removed.", "success");
}

function deleteMatrixLink(index) {
    if (currentUser && currentUser.role === "hod") {
        showToast("Qualification link deletion is restricted to Operator role.", "warning");
        return;
    }
    if (!confirm("Are you sure you want to remove this qualification link?")) return;
    productAppMatrixDB.splice(index, 1);
    saveMasterDataDB();
    renderMasterTables();
    showToast("Qualification link removed.", "success");
}

window.switchMasterTab = switchMasterTab;
window.handleSmartMasterRegister = handleSmartMasterRegister;
window.openCreateMasterCodeModal = openCreateMasterCodeModal;
window.onMasterPillarSelectChange = onMasterPillarSelectChange;
window.handleCreateMasterCodeSubmit = handleCreateMasterCodeSubmit;
window.openCreateMatrixLinkModal = openCreateMatrixLinkModal;
window.handleCreateMatrixLinkSubmit = handleCreateMatrixLinkSubmit;
window.deleteMasterItem = deleteMasterItem;
window.deleteMatrixLink = deleteMatrixLink;
window.masterProductsDB = masterProductsDB;
window.masterRMDB = masterRMDB;
window.masterAppDB = masterAppDB;
window.masterPkgDB = masterPkgDB;
window.masterProcessDB = masterProcessDB;
window.productAppMatrixDB = productAppMatrixDB;
window.saveMasterDataDB = saveMasterDataDB;

// --- AUTHORITY COLOR SETTINGS CONTROLLER ---
function applyRatingColors() {
    document.documentElement.style.setProperty('--rating-color-crit', ratingColors.crit);
    document.documentElement.style.setProperty('--rating-color-high', ratingColors.high);
    document.documentElement.style.setProperty('--rating-color-medium', ratingColors.medium);
    document.documentElement.style.setProperty('--rating-color-lowmed', ratingColors.lowmed);
    document.documentElement.style.setProperty('--rating-color-low', ratingColors.low);
    updateColorPreviewSwatches();
}

function updateColorPreviewSwatches() {
    const critEl = document.getElementById("color-crit");
    const highEl = document.getElementById("color-high");
    const medEl = document.getElementById("color-medium");
    const lowmedEl = document.getElementById("color-lowmed");
    const lowEl = document.getElementById("color-low");

    const cCrit = critEl ? critEl.value : ratingColors.crit;
    const cHigh = highEl ? highEl.value : ratingColors.high;
    const cMed = medEl ? medEl.value : ratingColors.medium;
    const cLowmed = lowmedEl ? lowmedEl.value : ratingColors.lowmed;
    const cLow = lowEl ? lowEl.value : ratingColors.low;

    // Update live spectrum bar blocks
    if (document.getElementById("bar-crit")) document.getElementById("bar-crit").style.backgroundColor = cCrit;
    if (document.getElementById("bar-high")) document.getElementById("bar-high").style.backgroundColor = cHigh;
    if (document.getElementById("bar-medium")) document.getElementById("bar-medium").style.backgroundColor = cMed;
    if (document.getElementById("bar-lowmed")) document.getElementById("bar-lowmed").style.backgroundColor = cLowmed;
    if (document.getElementById("bar-low")) document.getElementById("bar-low").style.backgroundColor = cLow;

    // Update row accent borders
    const rowCrit = document.getElementById("row-color-crit");
    if (rowCrit) rowCrit.style.borderLeftColor = cCrit;
    const rowHigh = document.getElementById("row-color-high");
    if (rowHigh) rowHigh.style.borderLeftColor = cHigh;
    const rowMed = document.getElementById("row-color-medium");
    if (rowMed) rowMed.style.borderLeftColor = cMed;
    const rowLowmed = document.getElementById("row-color-lowmed");
    if (rowLowmed) rowLowmed.style.borderLeftColor = cLowmed;
    const rowLow = document.getElementById("row-color-low");
    if (rowLow) rowLow.style.borderLeftColor = cLow;
}

function populateSettingsColors() {
    if (document.getElementById("color-crit")) document.getElementById("color-crit").value = ratingColors.crit;
    if (document.getElementById("color-high")) document.getElementById("color-high").value = ratingColors.high;
    if (document.getElementById("color-medium")) document.getElementById("color-medium").value = ratingColors.medium;
    if (document.getElementById("color-lowmed")) document.getElementById("color-lowmed").value = ratingColors.lowmed;
    if (document.getElementById("color-low")) document.getElementById("color-low").value = ratingColors.low;
    updateColorPreviewSwatches();
}

function populateSettingsProfile() {
    if (!currentUser) return;
    const usernameInput = document.getElementById("settings-username");
    if (usernameInput) usernameInput.value = currentUser.username || "";

    const displayNameInput = document.getElementById("settings-display-name");
    if (displayNameInput) {
        displayNameInput.value = currentUser.displayName || (currentUser.username ? currentUser.username.split('@')[0] : "");
    }

    const emailInput = document.getElementById("settings-email");
    if (emailInput) {
        emailInput.value = currentUser.email || (currentUser.username.includes('@') ? currentUser.username : `${currentUser.username}@company.com`);
    }

    const roleInput = document.getElementById("settings-role");
    if (roleInput) {
        roleInput.value = currentUser.role === "hod" ? "Head of Department (HOD)" : "Operator";
    }

    const passInput = document.getElementById("settings-user-pass");
    if (passInput) passInput.value = currentUser.password || "";

    const newPassInput = document.getElementById("settings-new-password");
    if (newPassInput) newPassInput.value = "";

    const confirmPassInput = document.getElementById("settings-confirm-password");
    if (confirmPassInput) confirmPassInput.value = "";

    const hodPassInput = document.getElementById("settings-new-pass");
    if (hodPassInput) hodPassInput.value = "";
}

function saveUserProfileChanges() {
    if (!currentUser) return;
    const newUsername = document.getElementById("settings-username").value.trim();
    const displayName = document.getElementById("settings-display-name") ? document.getElementById("settings-display-name").value.trim() : "";
    const email = document.getElementById("settings-email") ? document.getElementById("settings-email").value.trim() : "";
    const currentPass = document.getElementById("settings-user-pass") ? document.getElementById("settings-user-pass").value : "";
    const newPass = document.getElementById("settings-new-password") ? document.getElementById("settings-new-password").value : "";
    const confirmPass = document.getElementById("settings-confirm-password") ? document.getElementById("settings-confirm-password").value : "";

    if (!newUsername) {
        showToast("Username cannot be empty.", "error");
        return;
    }

    if (newPass || confirmPass) {
        if (newPass !== confirmPass) {
            showToast("New password and confirm password do not match.", "error");
            return;
        }
        if (newPass.length < 6) {
            showToast("Password must contain at least 6 characters.", "error");
            return;
        }
    }

    currentUser.username = newUsername;
    currentUser.displayName = displayName;
    currentUser.email = email;
    if (newPass) {
        currentUser.password = newPass;
    } else if (currentPass) {
        currentUser.password = currentPass;
    }

    const existingIndex = usersDB.findIndex(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
    if (existingIndex !== -1) {
        usersDB[existingIndex] = { 
            ...usersDB[existingIndex], 
            username: newUsername, 
            displayName, 
            email, 
            password: currentUser.password 
        };
    } else {
        usersDB.push({ ...currentUser });
    }

    localStorage.setItem("fmea_users", JSON.stringify(usersDB));
    localStorage.setItem("fmea_session_user", JSON.stringify(currentUser));

    checkActiveSession();
    logGlobalActivity("Updated User Profile", "Settings", `Updated profile details for "${newUsername}".`);
    showToast("Profile changes saved successfully!", "success");
}
window.saveUserProfileChanges = saveUserProfileChanges;

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    const icon = btn.querySelector("i");
    if (icon) {
        icon.setAttribute("data-lucide", isPass ? "eye-off" : "eye");
        if (window.lucide) window.lucide.createIcons();
    }
}
window.togglePasswordVisibility = togglePasswordVisibility;

function updateUserPasswordFromSecurity() {
    if (!currentUser) return;
    const currentPass = document.getElementById("sec-current-pass").value;
    const newPass = document.getElementById("sec-new-pass").value;
    const confirmPass = document.getElementById("sec-confirm-pass").value;

    if (!newPass || !confirmPass) {
        showToast("Please enter and confirm your new password.", "error");
        return;
    }

    if (newPass !== confirmPass) {
        showToast("New password and confirm password do not match.", "error");
        return;
    }

    if (newPass.length < 6) {
        showToast("Password must contain at least 6 characters.", "error");
        return;
    }

    currentUser.password = newPass;
    const index = usersDB.findIndex(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
    if (index !== -1) {
        usersDB[index].password = newPass;
        localStorage.setItem("fmea_users", JSON.stringify(usersDB));
    }
    localStorage.setItem("fmea_session_user", JSON.stringify(currentUser));

    document.getElementById("sec-current-pass").value = newPass;
    document.getElementById("sec-new-pass").value = "";
    document.getElementById("sec-confirm-pass").value = "";

    logGlobalActivity("Updated Login Password", "Security Settings", "Updated account login password.");
    showToast("Login password updated successfully!", "success");
}
window.updateUserPasswordFromSecurity = updateUserPasswordFromSecurity;

function updateHODPasswordFromSecurity() {
    if (!currentUser) return;
    const newPass = document.getElementById("hod-new-pass").value;
    const confirmPass = document.getElementById("hod-confirm-pass").value;

    if (!newPass || !confirmPass) {
        showToast("Please enter and confirm the new HOD authorization password.", "error");
        return;
    }

    if (newPass !== confirmPass) {
        showToast("New HOD password and confirmation do not match.", "error");
        return;
    }

    localStorage.setItem("fmea_hod_auth_pass", newPass);
    if (currentUser.role === "hod") {
        currentUser.password = newPass;
        const index = usersDB.findIndex(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
        if (index !== -1) {
            usersDB[index].password = newPass;
            localStorage.setItem("fmea_users", JSON.stringify(usersDB));
        }
        localStorage.setItem("fmea_session_user", JSON.stringify(currentUser));
    }

    const currentHodInput = document.getElementById("hod-current-pass");
    if (currentHodInput) currentHodInput.value = newPass;

    const hodNewPass = document.getElementById("hod-new-pass");
    if (hodNewPass) hodNewPass.value = "";
    const hodConfirmPass = document.getElementById("hod-confirm-pass");
    if (hodConfirmPass) hodConfirmPass.value = "";

    logGlobalActivity("Updated HOD Security Password", "Security Settings", "Updated HOD master authorization passkey.");
    showToast("HOD Security Password updated successfully!", "success");
}
window.updateHODPasswordFromSecurity = updateHODPasswordFromSecurity;

function logoutAllDevices() {
    if (confirm("Are you sure you want to log out all devices? This will invalidate all active login sessions.")) {
        logGlobalActivity("Logged Out All Devices", "Security Settings", "Terminated all active sessions.");
        showToast("Logged out all active sessions.", "info");
        handleLogout();
    }
}
window.logoutAllDevices = logoutAllDevices;

function saveSecurityNotificationPrefs() {
    const email = document.getElementById("sec-notif-email") ? document.getElementById("sec-notif-email").value.trim() : "";
    if (email) {
        localStorage.setItem("fmea_security_notif_email", email);
    }
    showToast("Security notification preferences saved!", "success");
}
window.saveSecurityNotificationPrefs = saveSecurityNotificationPrefs;

function populateSecurityTab() {
    if (!currentUser) return;
    const secCurrentPass = document.getElementById("sec-current-pass");
    if (secCurrentPass) secCurrentPass.value = currentUser.password || "";

    const hodCurrentPass = document.getElementById("hod-current-pass");
    if (hodCurrentPass) {
        hodCurrentPass.value = localStorage.getItem("fmea_hod_auth_pass") || "hod123";
    }

    const notifEmail = document.getElementById("sec-notif-email");
    if (notifEmail) {
        notifEmail.value = localStorage.getItem("fmea_security_notif_email") || currentUser.email || (currentUser.username.includes('@') ? currentUser.username : `${currentUser.username}@company.com`);
    }
}
window.populateSecurityTab = populateSecurityTab;

function handleHODPassUpdate() {
    if (!currentUser) return;
    const newPass = document.getElementById("settings-new-pass").value;

    if (!newPass) {
        showToast("Authorization password cannot be empty.", "error");
        return;
    }

    if (currentUser.role === "hod") {
        currentUser.password = newPass;
        const index = usersDB.findIndex(u => u.username === currentUser.username);
        if (index !== -1) {
            usersDB[index].password = newPass;
            localStorage.setItem("fmea_users", JSON.stringify(usersDB));
        }
        localStorage.setItem("fmea_session_user", JSON.stringify(currentUser));
    }

    localStorage.setItem("fmea_hod_auth_pass", newPass);
    document.getElementById("settings-new-pass").value = "";
    logGlobalActivity("Updated HOD Security Password", "Settings", "Security authorization password updated.");
    showToast("HOD Security Authorization Password updated successfully!", "success");
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

    logGlobalActivity("Exported Worksheet CSV", "Import/Export", `Exported ${form.name} ${viewType.toUpperCase()} (${activeSubtab}) worksheet to CSV.`);

    showToast(`Exported ${viewType.toUpperCase()} worksheet to Excel CSV.`, "success");
}

// --- IMPORT & SCAN HISTORY LOG CONTROLLER ---
function jumpToLibraryBatch(section) {
    // Close modal if open
    const modal = document.getElementById("scan-history-modal");
    if (modal) modal.classList.remove("active");

    switchView("library");
    const targetSection = section || "raw_material";
    const libSearchInput = document.getElementById("lib-search");
    if (libSearchInput) libSearchInput.value = "";
    const libCatFilter = document.getElementById("lib-filter-category");
    if (libCatFilter) libCatFilter.value = "all";

    const subBtn = document.querySelector(`#lib-sub-nav .sub-tab-btn[data-section="${targetSection}"]`);
    if (subBtn) subBtn.click();
    showToast(`Jumped to History Library -> ${targetSection.replace(/_/g, " ").toUpperCase()}`, "info");
}

function renderScanHistoryLog() {
    const tbody = document.getElementById("scan-history-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    document.getElementById("scan-history-batch-detail").style.display = "none";

    if (!scanHistoryDB || scanHistoryDB.length === 0) {
        renderScanHistoryPanel();
    }

    if (scanHistoryDB.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No file import or scan history recorded yet.</td></tr>`;
        return;
    }

    scanHistoryDB.forEach((item, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="font-size: 0.8rem; font-weight: 500;">${item.timestamp}</td>
            <td><strong style="color: var(--primary-color);">${item.filename}</strong></td>
            <td><span class="card-category-badge">${item.targetArea}</span></td>
            <td style="text-align: center;"><span style="font-weight: 700; background: rgba(59, 130, 246, 0.15); color: #2563eb; padding: 0.15rem 0.5rem; border-radius: 10px;">${item.rowCount} row(s)</span></td>
            <td style="font-size: 0.8rem;">${item.importedBy || 'Operator'}</td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button class="btn-table-action jump-batch-btn" title="Open in History Library" style="color: #16a34a;">
                        <i data-lucide="external-link" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="btn-table-action view-batch-btn" title="View Imported Batch Items" style="color: #2563eb;">
                        <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="btn-table-action delete-batch-btn delete" title="Delete History Record">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </td>
        `;

        tr.querySelector(".jump-batch-btn").addEventListener("click", () => {
            jumpToLibraryBatch(item.section);
        });

        tr.querySelector(".view-batch-btn").addEventListener("click", () => {
            viewScanBatchDetail(item.id);
        });

        tr.querySelector(".delete-batch-btn").addEventListener("click", () => {
            deleteScanHistoryRecord(item.id);
        });

        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

function viewScanBatchDetail(scanId) {
    const record = scanHistoryDB.find(s => s.id === scanId);
    if (!record) return;

    const detailContainer = document.getElementById("scan-history-batch-detail");
    const detailTitle = document.getElementById("scan-detail-title");
    const detailTbody = document.getElementById("scan-detail-tbody");

    detailTitle.innerHTML = `Imported Batch Items: <strong>${record.filename}</strong> (${record.rowCount} items) <button id="btn-jump-from-modal-detail" class="btn btn-secondary" style="font-size: 0.72rem; padding: 0.2rem 0.5rem; margin-left: 0.5rem; color: #16a34a;"><i data-lucide="external-link" style="width: 12px; height: 12px; display: inline-block;"></i> Open in Library</button>`;
    detailTbody.innerHTML = "";

    (record.items || []).forEach((item, idx) => {
        const sVal = item.sev || 1;
        const oVal = item.occ || 1;
        const dVal = item.det || 1;
        const rpn = sVal * oVal * dVal;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td><strong>${item.step || item.item || '-'}</strong></td>
            <td style="color: #dc2626;">${item.mode || '-'}</td>
            <td style="text-align: center;"><span class="rating-cell-badge ${getRatingClass(sVal)}">${sVal}</span></td>
            <td style="text-align: center;"><span class="rating-cell-badge ${getRatingClass(oVal)}">${oVal}</span></td>
            <td style="text-align: center;"><span class="rating-cell-badge ${getRatingClass(dVal)}">${dVal}</span></td>
            <td style="text-align: center;"><span class="rpn-badge ${getRpnClass(rpn)}">${rpn}</span></td>
        `;
        detailTbody.appendChild(tr);
    });

    const jumpBtn = document.getElementById("btn-jump-from-modal-detail");
    if (jumpBtn) {
        jumpBtn.addEventListener("click", () => jumpToLibraryBatch(record.section));
    }

    detailContainer.style.display = "block";
    detailContainer.scrollIntoView({ behavior: "smooth" });
    lucide.createIcons();
}

function deleteScanHistoryRecord(scanId) {
    const index = scanHistoryDB.findIndex(s => s.id === scanId);
    if (index === -1) return;
    scanHistoryDB.splice(index, 1);
    localStorage.setItem("fmea_scan_history", JSON.stringify(scanHistoryDB));
    renderScanHistoryLog();
    renderScanHistoryPanel();
    showToast("Scan history record removed.", "success");
}

function clearScanHistoryLog() {
    if (scanHistoryDB.length === 0) return;
    if (confirm("Are you sure you want to clear all import and scan history log records?")) {
        scanHistoryDB = [];
        localStorage.setItem("fmea_scan_history", JSON.stringify(scanHistoryDB));
        renderScanHistoryLog();
        renderScanHistoryPanel();
        showToast("Import scan history log cleared.", "success");
    }
}

function exportScanHistoryCSV() {
    if (scanHistoryDB.length === 0) {
        showToast("No scan history records to export.", "error");
        return;
    }

    const headers = ["No.", "Timestamp", "File Name", "Target Destination", "Items Imported", "Imported By"];
    const rows = scanHistoryDB.map((item, idx) => [
        idx + 1,
        item.timestamp,
        item.filename,
        item.targetArea,
        item.rowCount,
        item.importedBy || "Operator"
    ]);

    const csvContent = [
        headers.join(","),
        ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `FMEA_Import_Scan_History_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Exported scan history log to CSV.", "success");
}

function renderScanHistoryPanel() {
    const tbody = document.getElementById("page-scan-history-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    document.getElementById("page-scan-batch-detail").style.display = "none";

    // Auto-seed historical scan entries only on initial fresh load if key never existed
    if (localStorage.getItem("fmea_scan_history") === null && (!scanHistoryDB || scanHistoryDB.length === 0)) {
        const rawMatItems = libraryDB.filter(i => i.section === "raw_material");
        const packingItems = libraryDB.filter(i => i.section === "packing_shipment" || i.section === "packaging");
        const processItems = libraryDB.filter(i => i.section === "process" || i.section === "formulation");

        scanHistoryDB = [
            {
                id: "scan-hist-1",
                timestamp: new Date().toLocaleString(),
                filename: "Packing.xlsx",
                targetArea: "History Library (PACKING_SHIPMENT)",
                section: "packing_shipment",
                rowCount: packingItems.length || 4,
                importedBy: currentUser ? currentUser.username : "jack@penchem.com",
                items: packingItems.length > 0 ? packingItems : [
                    { step: "Shipment Packing", mode: "Wrong product picked", sev: 9, occ: 3, det: 3 },
                    { step: "Cartridge Labeling", mode: "Wrong batch selected", sev: 10, occ: 2, det: 2 }
                ]
            },
            {
                id: "scan-hist-2",
                timestamp: new Date(Date.now() - 3600000 * 3).toLocaleString(),
                filename: "Process_FMEA_Batch.csv",
                targetArea: "History Library (PROCESS)",
                section: "process",
                rowCount: processItems.length || 3,
                importedBy: currentUser ? currentUser.username : "jack@penchem.com",
                items: processItems.length > 0 ? processItems : [
                    { step: "Amine Curing Agent blend ratio", mode: "Exothermic runaway during mixing", sev: 9, occ: 3, det: 7 }
                ]
            },
            {
                id: "scan-hist-3",
                timestamp: new Date(Date.now() - 3600000 * 24).toLocaleString(),
                filename: "Raw_Material_FMEA_Historical.csv",
                targetArea: "History Library (RAW_MATERIAL)",
                section: "raw_material",
                rowCount: rawMatItems.length || 5,
                importedBy: currentUser ? currentUser.username : "jack@penchem.com",
                items: rawMatItems.length > 0 ? rawMatItems : [
                    { step: "Bisphenol-A Liquid Epoxy Resin", mode: "High Moisture Content in raw material", sev: 8, occ: 4, det: 6 }
                ]
            }
        ];
        localStorage.setItem("fmea_scan_history", JSON.stringify(scanHistoryDB));
    }

    // Summary cards metrics
    const totalBatches = scanHistoryDB ? scanHistoryDB.length : 0;
    const totalRowsParsed = scanHistoryDB ? scanHistoryDB.reduce((sum, item) => sum + (item.rowCount || (item.items ? item.items.length : 0)), 0) : 0;
    const lastScanDate = (scanHistoryDB && totalBatches > 0) ? scanHistoryDB[0].timestamp : "-";

    const totalBatchesEl = document.getElementById("stat-scan-total-batches");
    if (totalBatchesEl) totalBatchesEl.textContent = totalBatches;
    const totalRowsEl = document.getElementById("stat-scan-total-rows");
    if (totalRowsEl) totalRowsEl.textContent = totalRowsParsed;
    const lastDateEl = document.getElementById("stat-scan-last-date");
    if (lastDateEl) lastDateEl.textContent = lastScanDate;

    if (totalBatches === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No file import history records logged yet. Use the "Import Excel / CSV" button to import files.</td></tr>`;
        return;
    }

    scanHistoryDB.forEach((item, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="font-size: 0.85rem; font-weight: 500;">${item.timestamp}</td>
            <td><strong style="color: var(--primary-color);">${item.filename}</strong></td>
            <td><span class="card-category-badge">${item.targetArea}</span></td>
            <td style="text-align: center;"><span style="font-weight: 700; background: rgba(59, 130, 246, 0.15); color: #2563eb; padding: 0.2rem 0.65rem; border-radius: 12px;">${item.rowCount} row(s)</span></td>
            <td style="font-size: 0.85rem;">${item.importedBy || 'Operator'}</td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 6px; justify-content: center;">
                    <button class="btn-table-action jump-page-batch-btn" title="Open in History Library" style="color: #16a34a; padding: 0.3rem 0.5rem; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="external-link" style="width: 14px; height: 14px;"></i>
                        <span style="font-size: 0.75rem;">Open in Library</span>
                    </button>
                    <button class="btn-table-action view-page-batch-btn" title="View Imported Batch Items" style="color: #2563eb; padding: 0.3rem 0.5rem; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                        <span style="font-size: 0.75rem;">View</span>
                    </button>
                    <button class="btn-table-action delete-page-batch-btn delete" title="Delete Log Record">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </td>
        `;

        tr.querySelector(".jump-page-batch-btn").addEventListener("click", () => {
            jumpToLibraryBatch(item.section);
        });

        tr.querySelector(".view-page-batch-btn").addEventListener("click", () => {
            viewPageScanBatchDetail(item.id);
        });

        tr.querySelector(".delete-page-batch-btn").addEventListener("click", () => {
            deleteScanHistoryRecord(item.id);
            renderScanHistoryPanel();
        });

        tbody.appendChild(tr);
    });

    lucide.createIcons();
}

function viewPageScanBatchDetail(scanId) {
    const record = scanHistoryDB.find(s => s.id === scanId);
    if (!record) return;

    const detailContainer = document.getElementById("page-scan-batch-detail");
    const detailTitle = document.getElementById("page-scan-detail-title");
    const detailTbody = document.getElementById("page-scan-detail-tbody");

    detailTitle.innerHTML = `Imported Batch Items: <strong>${record.filename}</strong> (${record.rowCount} items) <button id="btn-jump-from-page-detail" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.25rem 0.55rem; margin-left: 0.5rem; color: #16a34a;"><i data-lucide="external-link" style="width: 12px; height: 12px; display: inline-block;"></i> Open in History Library</button>`;
    detailTbody.innerHTML = "";

    (record.items || []).forEach((item, idx) => {
        const sVal = item.sev || 1;
        const oVal = item.occ || 1;
        const dVal = item.det || 1;
        const rpn = sVal * oVal * dVal;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td><strong>${item.step || item.item || '-'}</strong></td>
            <td style="color: #dc2626;">${item.mode || '-'}</td>
            <td style="text-align: center;"><span class="rating-cell-badge ${getRatingClass(sVal)}">${sVal}</span></td>
            <td style="text-align: center;"><span class="rating-cell-badge ${getRatingClass(oVal)}">${oVal}</span></td>
            <td style="text-align: center;"><span class="rating-cell-badge ${getRatingClass(dVal)}">${dVal}</span></td>
            <td style="text-align: center;"><span class="rpn-badge ${getRpnClass(rpn)}">${rpn}</span></td>
        `;
        detailTbody.appendChild(tr);
    });

    const jumpBtn = document.getElementById("btn-jump-from-page-detail");
    if (jumpBtn) {
        jumpBtn.addEventListener("click", () => jumpToLibraryBatch(record.section));
    }

    detailContainer.style.display = "block";
    detailContainer.scrollIntoView({ behavior: "smooth" });
    lucide.createIcons();
}

// --- REAL-TIME GLOBAL ACTIVITY & OPERATION HISTORY LOGGING ---
const defaultGlobalActivityLogs = [
    {
        id: "act-init-1",
        timestamp: "2026-09-23 09:15:00",
        date: "2026-09-23",
        time: "09:15:00",
        user: "jack",
        role: "Operator",
        action: "User Signed In",
        category: "Authentication",
        details: "Operator jack signed in to adhesive quality workspace.",
        formulation: "AG111 [AG series]"
    },
    {
        id: "act-init-2",
        timestamp: "2026-09-23 09:18:22",
        date: "2026-09-23",
        time: "09:18:22",
        user: "jack",
        role: "Operator",
        action: "Updated DFMEA Severity",
        category: "DFMEA",
        details: "Row #1 (Bisphenol-A Liquid Epoxy Resin): Updated Severity rating from 7 to 8. Recalculated RPN: 192.",
        formulation: "AG111 [AG series]"
    },
    {
        id: "act-init-3",
        timestamp: "2026-09-23 09:22:10",
        date: "2026-09-23",
        time: "09:22:10",
        user: "jack",
        role: "Operator",
        action: "Imported Library Template",
        category: "Library",
        details: "Imported historical mitigation for 'Amine Curing Agent blend ratio' into DFMEA formulation tab.",
        formulation: "AG111 [AG series]"
    },
    {
        id: "act-init-4",
        timestamp: "2026-09-23 09:28:45",
        date: "2026-09-23",
        time: "09:28:45",
        user: "jack",
        role: "Operator",
        action: "Updated Profile Settings",
        category: "Settings",
        details: "Updated user account profile credentials and workspace authority parameters.",
        formulation: "AG111 [AG series]"
    }
];

function getGlobalActivityLogs() {
    let logs = JSON.parse(localStorage.getItem("fmea_global_activity_log"));
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
        logs = [...defaultGlobalActivityLogs];
        localStorage.setItem("fmea_global_activity_log", JSON.stringify(logs));
    }
    return logs;
}

function logGlobalActivity(action, category, details) {
    const now = new Date();
    const pad = num => String(num).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const timestampStr = `${dateStr} ${timeStr}`;
    const username = currentUser ? currentUser.username : "jack";
    const role = currentUser ? (currentUser.role === "hod" ? "HOD" : "Operator") : "Operator";
    const activeForm = typeof getActiveFormulation === "function" ? getActiveFormulation() : null;
    const formName = activeForm ? activeForm.name : "N/A";

    const entry = {
        id: "act-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        timestamp: timestampStr,
        date: dateStr,
        time: timeStr,
        user: username,
        role: role,
        action: action,
        category: category || "General",
        details: details || "Action executed.",
        formulation: formName
    };

    let logs = getGlobalActivityLogs();
    logs.unshift(entry);
    if (logs.length > 500) logs = logs.slice(0, 500);
    localStorage.setItem("fmea_global_activity_log", JSON.stringify(logs));

    if (activeForm) {
        if (!activeForm.auditLogs) activeForm.auditLogs = [];
        activeForm.auditLogs.unshift({
            timestamp: timestampStr,
            user: `${username} (${role})`,
            action: action,
            details: details
        });
        localStorage.setItem("fmea_formulations", JSON.stringify(formulationsDB));
    }

    renderGlobalActivityLogs();
    const auditTbody = document.getElementById("audit-activity-tbody");
    if (auditTbody && typeof renderAuditPageActivityLogs === "function") {
        renderAuditPageActivityLogs();
    }
}

function renderGlobalActivityLogs() {
    const container = document.getElementById("activity-drawer-content");
    if (!container) return;

    const filterInput = document.getElementById("activity-search-input");
    const filterText = filterInput ? filterInput.value.toLowerCase().trim() : "";

    let logs = getGlobalActivityLogs();
    if (filterText) {
        logs = logs.filter(l => 
            l.timestamp.toLowerCase().includes(filterText) ||
            l.user.toLowerCase().includes(filterText) ||
            l.action.toLowerCase().includes(filterText) ||
            l.category.toLowerCase().includes(filterText) ||
            l.details.toLowerCase().includes(filterText) ||
            (l.formulation && l.formulation.toLowerCase().includes(filterText))
        );
    }

    if (logs.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
                <i data-lucide="history" style="width: 32px; height: 32px; margin-bottom: 0.5rem; opacity: 0.5;"></i>
                <p style="font-size: 0.85rem; margin: 0;">No history logs match your query.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    let html = "";
    logs.forEach(log => {
        let catColor = "#3b82f6";
        let catBg = "rgba(59, 130, 246, 0.1)";
        if (log.category === "DFMEA" || log.category === "PFMEA") {
            catColor = "#8b5cf6";
            catBg = "rgba(139, 92, 246, 0.1)";
        } else if (log.category === "Security" || log.category === "Approval") {
            catColor = "#ef4444";
            catBg = "rgba(239, 68, 68, 0.1)";
        } else if (log.category === "Formulations") {
            catColor = "#10b981";
            catBg = "rgba(16, 185, 129, 0.1)";
        } else if (log.category === "Import/Export") {
            catColor = "#d97706";
            catBg = "rgba(245, 158, 11, 0.1)";
        }

        html += `
            <div class="activity-log-card">
                <div class="activity-log-top">
                    <span class="activity-log-timestamp">
                        <i data-lucide="clock" style="width: 12px; height: 12px;"></i>
                        ${log.timestamp}
                    </span>
                    <span class="activity-log-user-badge">
                        ${log.user} (${log.role || 'Operator'})
                    </span>
                </div>
                <div class="activity-log-action-title">
                    <span style="display: inline-block; padding: 0.15rem 0.45rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; background: ${catBg}; color: ${catColor};">
                        ${log.category}
                    </span>
                    <span>${log.action}</span>
                </div>
                <div class="activity-log-details">
                    ${log.details}
                </div>
                ${log.formulation && log.formulation !== "N/A" ? `<div style="font-size: 0.72rem; color: var(--text-muted); text-align: right;"><i data-lucide="flask-conical" style="width: 10px; height: 10px; inline-size: 10px;"></i> ${log.formulation}</div>` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

function renderAuditPageActivityLogs() {
    const tbody = document.getElementById("audit-activity-tbody");
    if (!tbody) return;

    let logs = getGlobalActivityLogs();
    tbody.innerHTML = "";

    if (!logs || logs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem; font-size: 0.78rem;">
                    No operation or activity logs recorded in workspace yet.
                </td>
            </tr>
        `;
        return;
    }

    logs.forEach((log) => {
        let catColor = "#2563eb";
        let catBg = "rgba(37, 99, 235, 0.08)";
        if (log.category === "DFMEA" || log.category === "PFMEA") {
            catColor = "#7c3aed";
            catBg = "rgba(124, 58, 237, 0.08)";
        } else if (log.category === "Security" || log.category === "Approval") {
            catColor = "#e11d48";
            catBg = "rgba(225, 29, 72, 0.08)";
        } else if (log.category === "Formulations") {
            catColor = "#059669";
            catBg = "rgba(5, 150, 105, 0.08)";
        } else if (log.category === "Import/Export") {
            catColor = "#d97706";
            catBg = "rgba(217, 119, 6, 0.08)";
        } else if (log.category === "Library") {
            catColor = "#0284c7";
            catBg = "rgba(2, 132, 199, 0.08)";
        } else if (log.category === "Navigation" || log.category === "Interface") {
            catColor = "#64748b";
            catBg = "rgba(100, 116, 139, 0.08)";
        }

        const tr = document.createElement("tr");
        tr.style.transition = "background-color 0.15s ease";
        tr.innerHTML = `
            <td style="font-size: 0.73rem; font-weight: 400; color: var(--text-muted); white-space: nowrap; padding: 0.32rem 0.5rem;">
                <i data-lucide="clock" style="width: 10px; height: 10px; vertical-align: middle; margin-right: 0.2rem; opacity: 0.5;"></i>
                ${log.timestamp}
            </td>
            <td style="font-size: 0.74rem; color: var(--text-secondary); padding: 0.32rem 0.5rem;">
                <span style="font-weight: 500; color: var(--text-primary);">${log.user}</span> <span style="font-size: 0.68rem; color: var(--text-muted); opacity: 0.85;">(${log.role || 'Operator'})</span>
            </td>
            <td style="padding: 0.32rem 0.5rem;">
                <span style="display: inline-block; padding: 0.08rem 0.45rem; border-radius: 10px; font-size: 0.65rem; font-weight: 500; background: ${catBg}; color: ${catColor};">
                    ${log.category}
                </span>
            </td>
            <td style="font-weight: 500; font-size: 0.75rem; color: var(--text-primary); padding: 0.32rem 0.5rem;">${log.action}</td>
            <td style="font-size: 0.74rem; color: var(--text-secondary); line-height: 1.35; padding: 0.32rem 0.5rem;">${log.details}</td>
            <td style="font-size: 0.72rem; font-weight: 400; color: var(--text-muted); padding: 0.32rem 0.5rem;">
                <i data-lucide="flask-conical" style="width: 10px; height: 10px; vertical-align: middle; margin-right: 0.15rem; opacity: 0.5;"></i>
                ${log.formulation || 'Workspace'}
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

// --- REGISTERED USER DIRECTORY & PERMANENT VAULT HANDLERS ---
function renderSettingsUserVault() {
    const tbody = document.getElementById("settings-users-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!usersDB || usersDB.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No user accounts stored in registry.</td></tr>`;
        return;
    }

    usersDB.forEach((user, idx) => {
        const isHod = user.role === "hod";
        const roleLabel = isHod ? "HOD (Approver)" : "Operator (Editor)";
        const roleBg = isHod ? "rgba(234, 88, 12, 0.1)" : "rgba(59, 130, 246, 0.1)";
        const roleColor = isHod ? "#ea580c" : "#2563eb";

        const isSelf = currentUser && currentUser.username && (user.username.toLowerCase() === currentUser.username.toLowerCase());
        const displayPass = isSelf ? (user.password || '') : '••••••••';

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="text-align: center; font-weight: 600;">${idx + 1}</td>
            <td style="font-size: 0.85rem;">
                <strong>${user.username}</strong>
                ${isSelf ? '<span style="font-size: 0.68rem; background: rgba(37, 99, 235, 0.1); color: #2563eb; padding: 0.1rem 0.45rem; border-radius: 10px; font-weight: 700; margin-left: 0.35rem;">(You)</span>' : ''}
            </td>
            <td>
                <span style="display: inline-block; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.72rem; font-weight: 700; background: ${roleBg}; color: ${roleColor};">
                    ${roleLabel}
                </span>
            </td>
            <td style="font-size: 0.85rem; color: var(--text-primary); font-family: monospace;">
                <code style="font-size: 0.82rem; background: var(--bg-tertiary, #f1f5f9); padding: 0.2rem 0.5rem; border-radius: 6px; border: 1px solid var(--border-color-light, #e2e8f0);">${displayPass}</code>
            </td>
            <td style="text-align: center;">
                <button class="btn-table-action delete" style="color: #dc2626; padding: 0.25rem 0.5rem; cursor: pointer;" title="Delete User Account" onclick="deleteUserAccount('${user.username.replace(/'/g, "\\'")}')">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px; vertical-align: middle;"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
}

function deleteUserAccount(username) {
    if (usersDB.length <= 1) {
        showToast("Cannot remove the last remaining user account.", "error");
        return;
    }
    if (currentUser && currentUser.username.toLowerCase() === username.toLowerCase()) {
        showToast("You cannot delete your own active session account.", "error");
        return;
    }
    if (confirm(`Are you sure you want to delete registered user account "${username}"?`)) {
        usersDB = usersDB.filter(u => u.username.toLowerCase() !== username.toLowerCase());
        localStorage.setItem("fmea_users", JSON.stringify(usersDB));
        renderSettingsUserVault();
        logGlobalActivity("Deleted User Account", "Settings", `Removed account "${username}" from workspace registry.`);
        showToast(`User account "${username}" removed from database.`, "success");
    }
}

function exportUsersVault() {
    if (!usersDB || usersDB.length === 0) {
        showToast("No user accounts to export.", "error");
        return;
    }
    const jsonStr = JSON.stringify(usersDB, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `FMEA_User_Accounts_Vault_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    logGlobalActivity("Exported User Accounts Vault", "Settings", `Exported ${usersDB.length} registered user account credentials to JSON.`);
    showToast(`Exported ${usersDB.length} registered user account credentials to JSON.`, "success");
}

function handleImportUsersVault(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const importedUsers = JSON.parse(evt.target.result);
            if (!Array.isArray(importedUsers) || importedUsers.length === 0) {
                showToast("Invalid user backup file structure.", "error");
                return;
            }

            let addedCount = 0;
            importedUsers.forEach(imp => {
                if (imp.username && imp.password) {
                    const idx = usersDB.findIndex(u => u.username.toLowerCase() === imp.username.toLowerCase());
                    if (idx === -1) {
                        usersDB.push({ username: imp.username, role: imp.role || "operator", password: imp.password });
                        addedCount++;
                    } else {
                        usersDB[idx] = { username: imp.username, role: imp.role || usersDB[idx].role, password: imp.password };
                    }
                }
            });

            localStorage.setItem("fmea_users", JSON.stringify(usersDB));
            renderSettingsUserVault();
            logGlobalActivity("Imported User Accounts Vault", "Settings", `Imported/Synced ${addedCount} user accounts into registry.`);
            showToast(`Successfully synced user database! ${addedCount} account(s) updated/added.`, "success");
            e.target.value = "";
        } catch (err) {
            showToast("Failed to parse user accounts JSON backup file.", "error");
        }
    };
    reader.readAsText(file);
}

// User Guide Section Switcher
function selectGuideSection(secId) {
    const panels = document.querySelectorAll('#view-user-guide .guide-content-panel');
    panels.forEach(panel => {
        panel.style.display = 'none';
        panel.classList.remove('active');
    });

    const navItems = document.querySelectorAll('#view-user-guide .guide-nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });

    const targetPanel = document.getElementById(secId);
    if (targetPanel) {
        targetPanel.style.display = 'flex';
        targetPanel.classList.add('active');
    }

    const targetNav = document.querySelector(`#view-user-guide .guide-nav-item[data-section="${secId}"]`);
    if (targetNav) {
        targetNav.classList.add('active');
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}
window.selectGuideSection = selectGuideSection;

// Settings Tab Switcher
function selectSettingsTab(tabId) {
    const panels = document.querySelectorAll('#view-settings .guide-content-panel');
    panels.forEach(panel => {
        panel.style.display = 'none';
        panel.classList.remove('active');
    });

    const navItems = document.querySelectorAll('#view-settings .guide-nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });

    const targetPanel = document.getElementById(tabId);
    if (targetPanel) {
        targetPanel.style.display = 'flex';
        targetPanel.classList.add('active');
    }

    const targetNav = document.querySelector(`#view-settings .guide-nav-item[data-settings-tab="${tabId}"]`);
    if (targetNav) {
        targetNav.classList.add('active');
    }

    if (tabId === 'settings-tab-security') {
        populateSecurityTab();
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}
window.selectSettingsTab = selectSettingsTab;

// --- APPEARANCE SETTINGS LOGIC (Matching User Mockup) ---
let activeThemeMode = localStorage.getItem("fmea_theme_mode") || "light";
let activePrimaryColor = localStorage.getItem("fmea_primary_color") || "#6366f1";
let activeFontSize = localStorage.getItem("fmea_font_size") || "medium";

function selectThemeMode(mode) {
    activeThemeMode = mode;
    
    ["light", "dark", "system"].forEach(m => {
        const card = document.getElementById(`theme-card-${m}`);
        const radio = document.getElementById(`radio-dot-${m}`);
        if (card && radio) {
            if (m === mode) {
                card.style.border = "2px solid #2563eb";
                card.style.background = "#eff6ff";
                radio.style.border = "6px solid #2563eb";
                radio.style.background = "#ffffff";
            } else {
                card.style.border = "1px solid var(--border-color-light)";
                card.style.background = "var(--bg-tertiary)";
                radio.style.border = "2px solid #94a3b8";
                radio.style.background = "transparent";
            }
        }
    });

    if (mode === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
    } else if (mode === "light") {
        document.documentElement.setAttribute("data-theme", "light");
    } else if (mode === "system") {
        const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", systemDark ? "dark" : "light");
    }
}

function selectPrimaryColor(colorHex) {
    activePrimaryColor = colorHex;
    
    document.querySelectorAll("#primary-color-palette-picker .color-dot-btn").forEach(btn => {
        if (btn.dataset.color === colorHex) {
            btn.style.border = "3px solid #ffffff";
            btn.style.boxShadow = `0 0 0 2px ${colorHex}`;
        } else {
            btn.style.border = "none";
            btn.style.boxShadow = "none";
        }
    });

    document.documentElement.style.setProperty("--primary-color", colorHex);
}

function selectFontSize(size) {
    activeFontSize = size;
    
    ["small", "medium", "large"].forEach(s => {
        const btn = document.getElementById(`font-btn-${s}`);
        if (btn) {
            if (s === size) {
                btn.style.border = "2px solid #2563eb";
                btn.style.background = "#eff6ff";
                btn.style.color = "#2563eb";
                btn.style.fontWeight = "700";
            } else {
                btn.style.border = "1px solid var(--border-color-light)";
                btn.style.background = "var(--bg-tertiary)";
                btn.style.color = "var(--text-primary)";
                btn.style.fontWeight = "600";
            }
        }
    });

    if (size === "small") {
        document.documentElement.style.fontSize = "13px";
    } else if (size === "medium") {
        document.documentElement.style.fontSize = "14px";
    } else if (size === "large") {
        document.documentElement.style.fontSize = "15px";
    }
}

function saveAppearanceSettings() {
    localStorage.setItem("fmea_theme_mode", activeThemeMode);
    localStorage.setItem("fmea_primary_color", activePrimaryColor);
    localStorage.setItem("fmea_font_size", activeFontSize);
    
    showToast("Appearance settings saved successfully!", "success");
    logGlobalActivity("Updated Appearance Settings", "Settings", `Saved Theme: ${activeThemeMode}, Color: ${activePrimaryColor}, Font Size: ${activeFontSize}`);
}

window.selectThemeMode = selectThemeMode;
window.selectPrimaryColor = selectPrimaryColor;
window.selectFontSize = selectFontSize;
window.saveAppearanceSettings = saveAppearanceSettings;

// --- Sidebar Navigation Drag & Drop ---
function getNavItemKey(item) {
    return item.dataset.view || item.getAttribute("href") || item.textContent.trim();
}

function saveSidebarOrder() {
    const navContainer = document.querySelector(".sidebar-nav");
    if (!navContainer) return;
    const orderData = [];
    navContainer.querySelectorAll(".nav-group").forEach((group, groupIdx) => {
        group.querySelectorAll(".nav-item").forEach(item => {
            orderData.push({
                key: getNavItemKey(item),
                groupIdx: groupIdx
            });
        });
    });
    localStorage.setItem("fmea_sidebar_order_v5", JSON.stringify(orderData));
}

function restoreSidebarOrder() {
    const navContainer = document.querySelector(".sidebar-nav");
    if (!navContainer) return;

    // Always ensure Dashboard stays in the top standalone nav-group (above MASTER DATA)
    const dashboardItem = navContainer.querySelector('.nav-item[data-view="dashboard"]');
    const standaloneGroup = navContainer.querySelector('.nav-group.standalone') || navContainer.querySelectorAll('.nav-group')[0];
    if (dashboardItem && standaloneGroup && dashboardItem.parentNode !== standaloneGroup) {
        standaloneGroup.appendChild(dashboardItem);
    }

    // Clean up old legacy sidebar storage keys that moved dashboard inside master data
    localStorage.removeItem("fmea_sidebar_order_v4");

    const savedOrder = localStorage.getItem("fmea_sidebar_order_v5");
    if (!savedOrder) return;
    try {
        const orderData = JSON.parse(savedOrder);
        if (!Array.isArray(orderData) || orderData.length === 0) return;
        const groups = navContainer.querySelectorAll(".nav-group");
        const currentItems = Array.from(navContainer.querySelectorAll(".nav-item"));
        const itemMap = new Map();
        currentItems.forEach(item => itemMap.set(getNavItemKey(item), item));

        orderData.forEach(entry => {
            if (entry.key === "dashboard") return; // Dashboard is strictly pinned at the top
            const item = itemMap.get(entry.key);
            if (!item) return;
            const moveEl = item.closest(".nav-parent-group") || item;
            const targetGroup = groups[entry.groupIdx] || moveEl.parentNode;
            if (moveEl && targetGroup && moveEl.parentNode !== targetGroup) {
                targetGroup.appendChild(moveEl);
                itemMap.delete(entry.key);
            }
        });
    } catch (err) {
        console.warn("Could not restore sidebar order:", err);
    }
}

function handleNavClick(e, viewName) {
    const navItem = e ? (e.currentTarget || (e.target && e.target.closest ? e.target.closest('.nav-item') : null)) : null;
    if (navItem && navItem.dataset && navItem.dataset.wasDragged === "true") {
        delete navItem.dataset.wasDragged;
        return;
    }

    const sidebar = document.querySelector("aside.app-sidebar");
    const parentGroup = navItem ? navItem.closest(".nav-parent-group") : null;

    // If sidebar is collapsed and user clicks a parent group with subtabs (DFMEA, PFMEA), auto-expand the sidebar
    if (sidebar && sidebar.classList.contains("collapsed") && parentGroup) {
        toggleSidebar(false);
    }
    
    // Toggle expansion if already active parent is clicked
    if (parentGroup) {
        const isCurrentActive = navItem.classList.contains("active");
        if (isCurrentActive) {
            parentGroup.classList.toggle("expanded");
        } else {
            parentGroup.classList.add("expanded");
        }
    }

    if (viewName) {
        if (e && e.preventDefault) e.preventDefault();
        switchView(viewName);
    }
}
window.handleNavClick = handleNavClick;

function handleSubNavClick(e, viewName, subtab) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    switchView(viewName);
    switchSubtab(viewName, subtab);
    syncSidebarSubnav(viewName, subtab);
}
window.handleSubNavClick = handleSubNavClick;

function syncSidebarSubnav(viewType, subtab) {
    document.querySelectorAll(`.nav-sub-item[data-parent-view="${viewType}"]`).forEach(sub => {
        if (sub.dataset.subtab === subtab) {
            sub.classList.add("active");
        } else {
            sub.classList.remove("active");
        }
    });
}
window.syncSidebarSubnav = syncSidebarSubnav;

function initSidebarDragAndDrop() {
    restoreSidebarOrder();

    const navContainer = document.querySelector(".sidebar-nav");
    if (!navContainer) return;

    let draggedNavItem = null;
    const navItems = navContainer.querySelectorAll(".nav-item:not(.nav-sub-item)");

    navItems.forEach(item => {
        item.setAttribute("draggable", "true");
        if (item.dataset.dragInitialized === "true") return;
        item.dataset.dragInitialized = "true";

        item.addEventListener("dragstart", (e) => {
            draggedNavItem = item;
            item.classList.add("nav-item-dragging");
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", getNavItemKey(item));
            }
        });

        item.addEventListener("dragend", () => {
            draggedNavItem = null;
            navContainer.querySelectorAll(".nav-item").forEach(el => {
                el.classList.remove("nav-item-dragging", "nav-drag-over-top", "nav-drag-over-bottom");
            });
            saveSidebarOrder();
        });

        item.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (!draggedNavItem || draggedNavItem === item) return;

            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "move";
            }
            const rect = item.getBoundingClientRect();
            const offsetY = e.clientY - rect.top;
            const isTopHalf = offsetY < rect.height / 2;

            if (isTopHalf) {
                item.classList.add("nav-drag-over-top");
                item.classList.remove("nav-drag-over-bottom");
            } else {
                item.classList.add("nav-drag-over-bottom");
                item.classList.remove("nav-drag-over-top");
            }
        });

        item.addEventListener("dragleave", (e) => {
            if (!item.contains(e.relatedTarget)) {
                item.classList.remove("nav-drag-over-top", "nav-drag-over-bottom");
            }
        });

        item.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();

            item.classList.remove("nav-drag-over-top", "nav-drag-over-bottom");

            if (!draggedNavItem || draggedNavItem === item) return;

            // Mark that an actual drag reorder occurred
            draggedNavItem.dataset.wasDragged = "true";
            setTimeout(() => {
                if (draggedNavItem) delete draggedNavItem.dataset.wasDragged;
            }, 250);

            const rect = item.getBoundingClientRect();
            const offsetY = e.clientY - rect.top;
            const isTopHalf = offsetY < rect.height / 2;

            const targetParent = item.parentNode;
            if (targetParent) {
                if (isTopHalf) {
                    targetParent.insertBefore(draggedNavItem, item);
                } else {
                    targetParent.insertBefore(draggedNavItem, item.nextSibling);
                }
            }

            saveSidebarOrder();
        });
    });
}

window.initSidebarDragAndDrop = initSidebarDragAndDrop;

// Toggle Digital FMEA System Architecture flowchart visibility
function toggleArchitectureFlowchart() {
    const card = document.getElementById("fmea-architecture-card");
    const container = document.getElementById("fmea-flowchart-container");
    const btnText = document.getElementById("arch-toggle-text");
    const btnIcon = document.getElementById("arch-toggle-icon");
    if (!container) return;

    const isHidden = container.style.display === "none" || container.style.display === "";
    if (isHidden) {
        container.style.display = "flex";
        if (card) card.classList.remove("is-collapsed");
        if (btnText) btnText.textContent = "Hide System Architecture";
        if (btnIcon) {
            btnIcon.setAttribute("data-lucide", "chevron-up");
        }
    } else {
        container.style.display = "none";
        if (card) card.classList.add("is-collapsed");
        if (btnText) btnText.textContent = "Show System Architecture";
        if (btnIcon) {
            btnIcon.setAttribute("data-lucide", "chevron-down");
        }
    }
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

window.toggleArchitectureFlowchart = toggleArchitectureFlowchart;

// Toggle and persist sidebar collapse/pin state
let _lastSidebarToggleTimestamp = 0;
function toggleSidebar(forceState) {
    const now = Date.now();
    // Guard against rapid duplicate synchronous/bubbled event triggers
    if (typeof forceState !== "boolean" && (now - _lastSidebarToggleTimestamp < 220)) {
        return;
    }
    _lastSidebarToggleTimestamp = now;

    const sidebar = document.querySelector("aside.app-sidebar");
    const collapseBtn = document.getElementById("sidebar-collapse-btn");
    if (!sidebar) return;

    if (typeof forceState === "boolean") {
        sidebar.classList.toggle("collapsed", forceState);
    } else {
        sidebar.classList.toggle("collapsed");
    }
    const isCollapsed = sidebar.classList.contains("collapsed");
    localStorage.setItem("fmea_sidebar_collapsed", isCollapsed ? "true" : "false");

    if (collapseBtn) {
        if (isCollapsed) {
            collapseBtn.classList.add("is-active");
            collapseBtn.setAttribute("title", "Expand Sidebar Menu");
        } else {
            collapseBtn.classList.remove("is-active");
            collapseBtn.setAttribute("title", "Collapse & Lock Sidebar Menu");
        }
    }

    if (typeof logGlobalActivity === "function") {
        logGlobalActivity("Toggled Sidebar Mode", "Interface", `Switched sidebar to ${isCollapsed ? 'compact icon-rail' : 'expanded'} view mode.`);
    }
}
window.toggleSidebar = toggleSidebar;

// Restore saved sidebar collapse/pin state from localStorage
function restoreSidebarCollapsedState() {
    const sidebar = document.querySelector("aside.app-sidebar");
    const collapseBtn = document.getElementById("sidebar-collapse-btn");
    if (!sidebar) return;

    const isCollapsed = localStorage.getItem("fmea_sidebar_collapsed") === "true";
    if (isCollapsed) {
        sidebar.classList.add("collapsed");
        if (collapseBtn) {
            collapseBtn.classList.add("is-active");
            collapseBtn.setAttribute("title", "Expand Sidebar Menu");
        }
    } else {
        sidebar.classList.remove("collapsed");
        if (collapseBtn) {
            collapseBtn.classList.remove("is-active");
            collapseBtn.setAttribute("title", "Collapse & Lock Sidebar Menu");
        }
    }

    // Allow clicking on the collapsed left bar or logo to expand it easily
    if (!sidebar._collapsedClickBound) {
        sidebar._collapsedClickBound = true;
        sidebar.addEventListener("click", (e) => {
            if (!sidebar.classList.contains("collapsed")) return;
            // If clicking logo or background area of collapsed bar, expand it
            if (e.target.closest(".sidebar-logo") || !e.target.closest(".nav-item")) {
                toggleSidebar(false);
            }
        });
    }
}

window.restoreSidebarCollapsedState = restoreSidebarCollapsedState;

let _lastRatingGuideToggleTimestamp = 0;
function toggleRatingGuide(eOrForce) {
    const now = Date.now();
    let forceState;
    if (typeof eOrForce === "boolean") {
        forceState = eOrForce;
    } else {
        if (eOrForce && eOrForce.preventDefault) eOrForce.preventDefault();
        // Guard against rapid duplicate synchronous/bubbled event triggers
        if (now - _lastRatingGuideToggleTimestamp < 220) {
            return;
        }
        _lastRatingGuideToggleTimestamp = now;
    }

    const refSidebar = document.getElementById("reference-sidebar");
    const toggleBtn = document.getElementById("guidelines-toggle");
    if (!refSidebar) return;
    
    if (typeof forceState === "boolean") {
        // forceState: true means open (collapsed = false), false means close (collapsed = true)
        refSidebar.classList.toggle("collapsed", !forceState);
    } else {
        refSidebar.classList.toggle("collapsed");
    }

    const isCollapsed = refSidebar.classList.contains("collapsed");

    if (toggleBtn) {
        if (isCollapsed) {
            toggleBtn.classList.remove("active");
            toggleBtn.setAttribute("title", "Open FMEA Rating Guidelines");
        } else {
            toggleBtn.classList.add("active");
            toggleBtn.setAttribute("title", "Close FMEA Rating Guidelines");
        }
    }

    if (typeof logGlobalActivity === "function") {
        if (isCollapsed) {
            logGlobalActivity("Closed Rating Guidelines", "Interface", "Closed FMEA S/O/D rating guidelines drawer.");
        } else {
            logGlobalActivity("Opened Rating Guidelines", "Interface", "Opened FMEA S/O/D rating guidelines drawer.");
        }
    }

    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}
window.toggleRatingGuide = toggleRatingGuide;

// Close Rating Guidelines right bar if clicked outside or on Escape
document.addEventListener("click", (e) => {
    const refSidebar = document.getElementById("reference-sidebar");
    const toggleBtn = document.getElementById("guidelines-toggle");
    if (!refSidebar || refSidebar.classList.contains("collapsed")) return;
    if (!refSidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
        toggleRatingGuide(false);
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        const refSidebar = document.getElementById("reference-sidebar");
        if (refSidebar && !refSidebar.classList.contains("collapsed")) {
            toggleRatingGuide(false);
        }
    }
});

// --- DFMEA ↔ PFMEA INTERLINK & TRACEABILITY MATRIX ---
function openFMEAInterlinkSyncModal(mode) {
    const form = typeof getActiveFormulation === "function" ? getActiveFormulation() : null;
    const nameEl = document.getElementById("interlink-active-formulation-name");
    const tbody = document.getElementById("interlink-matrix-tbody");
    
    if (nameEl) {
        nameEl.textContent = form ? `${form.name} (Rev ${form.revision || '1.0'})` : "No Active Formulation Selected";
    }

    if (tbody) {
        tbody.innerHTML = "";
        if (!form) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No active formulation loaded. Please select a formulation.</td></tr>`;
        } else {
            const dfmeaSubtabs = ["raw_materials", "formulation", "application", "packaging"];
            let dfmeaItems = [];
            dfmeaSubtabs.forEach(sub => {
                if (form.dfmea && form.dfmea[sub]) {
                    dfmeaItems = dfmeaItems.concat(form.dfmea[sub]);
                }
            });

            const pfmeaSubtabs = ["operations", "logistics"];
            let pfmeaItems = [];
            pfmeaSubtabs.forEach(sub => {
                if (form.pfmea && form.pfmea[sub]) {
                    pfmeaItems = pfmeaItems.concat(form.pfmea[sub]);
                }
            });

            if (dfmeaItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No DFMEA items recorded for this formulation yet.</td></tr>`;
            } else {
                dfmeaItems.forEach((dfItem, idx) => {
                    const matchedPfItem = pfmeaItems[idx] || pfmeaItems.find(p => p.characteristic === dfItem.characteristic || p.item === dfItem.item);
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td><strong>${dfItem.item || 'Item'}</strong><br><small style="color: var(--primary-color); font-weight: 600;">CTQ: ${dfItem.characteristic || '-'}</small></td>
                        <td style="color: #dc2626;">${dfItem.failureMode || '-'}<br><small style="color: #64748b;">(S:${dfItem.severity || '-'}, O:${dfItem.occurrence || '-'}, RPN:${dfItem.rpn || '-'})</small></td>
                        <td>
                            ${matchedPfItem ? `
                                <span style="color: #059669; font-weight: 600;">Linked to: ${matchedPfItem.item || 'Process Step'}</span><br>
                                <small style="color: #475569;">Prev: ${matchedPfItem.prevention || '-'} | Det: ${matchedPfItem.detection || '-'}</small>
                            ` : `
                                <span style="color: #d97706; font-weight: 600;">Unlinked Process Step</span><br>
                                <button class="btn btn-secondary" style="font-size: 0.7rem; padding: 0.2rem 0.5rem; margin-top: 0.25rem;" onclick="syncSingleDFMEAToPFMEA('${dfItem.id}')">Link to PFMEA</button>
                            `}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }
    }

    const modal = document.getElementById("modal-fmea-interlink");
    if (modal) {
        modal.style.display = "";
        modal.classList.add("active");
    }
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

function syncDFMEAToPFMEA() {
    const form = typeof getActiveFormulation === "function" ? getActiveFormulation() : null;
    if (!form) {
        if (typeof showToast === "function") showToast("Please select an active formulation first.", "warning");
        return;
    }

    if (!form.pfmea) form.pfmea = { operations: [], logistics: [] };
    if (!form.pfmea.operations) form.pfmea.operations = [];

    const dfmeaSubtabs = ["raw_materials", "formulation", "application", "packaging"];
    let addedCount = 0;

    dfmeaSubtabs.forEach(sub => {
        if (form.dfmea && form.dfmea[sub]) {
            form.dfmea[sub].forEach(dfItem => {
                const exists = form.pfmea.operations.some(p => p.characteristic === dfItem.characteristic && p.item === dfItem.item);
                if (!exists && (dfItem.item || dfItem.characteristic)) {
                    form.pfmea.operations.push({
                        id: `pf-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                        item: `Process: ${dfItem.item || 'Component'}`,
                        functionSpec: dfItem.functionSpec || 'Maintain spec within CTQ limits',
                        deepDetail: dfItem.deepDetail || '',
                        characteristic: dfItem.characteristic || 'KPC/CTQ',
                        failureMode: dfItem.failureMode || 'Process Deviation',
                        effect: dfItem.effect || 'Out of spec quality',
                        severity: dfItem.severity || 5,
                        cause: `Derived Cause from DFMEA: ${dfItem.cause || dfItem.failureMode || 'Design constraint'}`,
                        occurrence: dfItem.occurrence || 3,
                        prevention: dfItem.prevention || 'Standard Operating Procedure (SOP)',
                        detection: dfItem.detection || 'In-line Inspection / QC Test',
                        detectionRating: dfItem.detectionRating || 3,
                        rpn: (parseInt(dfItem.severity || 5) * parseInt(dfItem.occurrence || 3) * parseInt(dfItem.detectionRating || 3)),
                        action: 'Establish Process Prevention & Monitoring',
                        ownerDate: 'Process Eng / Quality',
                        actionTaken: 'Linked from DFMEA CTQ',
                        dateCompleted: new Date().toISOString().split('T')[0],
                        revSeverity: dfItem.severity || 5,
                        revOccurrence: 2,
                        revDetection: 2,
                        revRpn: (parseInt(dfItem.severity || 5) * 2 * 2),
                        specialConcern: 'CTQ Linked',
                        caseHappened: 'No'
                    });
                    addedCount++;
                }
            });
        }
    });

    if (typeof saveFormulationsDB === "function") saveFormulationsDB();
    if (typeof filterAndRenderFMEA === "function") filterAndRenderFMEA();
    if (typeof updateDashboard === "function") updateDashboard();
    openFMEAInterlinkSyncModal();
    if (typeof showToast === "function") {
        if (addedCount > 0) {
            showToast(`Successfully synced ${addedCount} DFMEA CTQs into PFMEA process steps!`, "success");
        } else {
            showToast("All DFMEA CTQ items are already synced with PFMEA.", "info");
        }
    }
}

function syncSingleDFMEAToPFMEA(dfItemId) {
    const form = typeof getActiveFormulation === "function" ? getActiveFormulation() : null;
    if (!form) return;
    if (!form.pfmea) form.pfmea = { operations: [], logistics: [] };
    if (!form.pfmea.operations) form.pfmea.operations = [];

    let targetItem = null;
    ["raw_materials", "formulation", "application", "packaging"].forEach(sub => {
        if (form.dfmea && form.dfmea[sub]) {
            const found = form.dfmea[sub].find(i => i.id === dfItemId);
            if (found) targetItem = found;
        }
    });

    if (targetItem) {
        form.pfmea.operations.push({
            id: `pf-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            item: `Process: ${targetItem.item || 'Component'}`,
            functionSpec: targetItem.functionSpec || 'Maintain spec within CTQ limits',
            deepDetail: targetItem.deepDetail || '',
            characteristic: targetItem.characteristic || 'KPC/CTQ',
            failureMode: targetItem.failureMode || 'Process Deviation',
            effect: targetItem.effect || 'Out of spec quality',
            severity: targetItem.severity || 5,
            cause: `Derived Cause from DFMEA: ${targetItem.cause || targetItem.failureMode || 'Design constraint'}`,
            occurrence: targetItem.occurrence || 3,
            prevention: targetItem.prevention || 'Standard Operating Procedure (SOP)',
            detection: targetItem.detection || 'In-line Inspection / QC Test',
            detectionRating: targetItem.detectionRating || 3,
            rpn: (parseInt(targetItem.severity || 5) * parseInt(targetItem.occurrence || 3) * parseInt(targetItem.detectionRating || 3)),
            action: 'Establish Process Prevention & Monitoring',
            ownerDate: 'Process Eng / Quality',
            actionTaken: 'Linked from DFMEA CTQ',
            dateCompleted: new Date().toISOString().split('T')[0],
            revSeverity: targetItem.severity || 5,
            revOccurrence: 2,
            revDetection: 2,
            revRpn: (parseInt(targetItem.severity || 5) * 2 * 2),
            specialConcern: 'CTQ Linked',
            caseHappened: 'No'
        });
        if (typeof saveFormulationsDB === "function") saveFormulationsDB();
        if (typeof filterAndRenderFMEA === "function") filterAndRenderFMEA();
        if (typeof updateDashboard === "function") updateDashboard();
        openFMEAInterlinkSyncModal();
        if (typeof showToast === "function") showToast("Item linked to Process FMEA!", "success");
    }
}

window.openFMEAInterlinkSyncModal = openFMEAInterlinkSyncModal;
window.syncDFMEAToPFMEA = syncDFMEAToPFMEA;
window.syncSingleDFMEAToPFMEA = syncSingleDFMEAToPFMEA;

function toggleLinkedFMEA() {
    const activePanel = document.querySelector(".view-panel.active");
    const activeView = activePanel ? activePanel.id.replace("view-", "") : "";
    if (activeView === "dfmea") {
        switchView("pfmea");
        if (typeof showToast === "function") showToast("Switched to Process FMEA (PFMEA)", "info");
    } else if (activeView === "pfmea") {
        switchView("dfmea");
        if (typeof showToast === "function") showToast("Switched to Design FMEA (DFMEA)", "info");
    } else {
        switchView("dfmea");
    }
}
window.toggleLinkedFMEA = toggleLinkedFMEA;

// --- INTERLINK NAVIGATION HELPERS ---
function navigateToFMEA(viewType, subtab) {
    if (typeof switchView === "function") {
        switchView(viewType);
    }
    if (subtab && typeof switchSubtab === "function") {
        setTimeout(() => {
            switchSubtab(viewType, subtab);
        }, 60);
    }
    const labelMap = {
        "formulation": "1. Product Master",
        "raw_materials": "2. Raw Material Master",
        "application": "3. Application Master",
        "packaging": "4. Packaging Master",
        "operations": "5. Process Master",
        "logistics": "Packing & Logistic Shipment"
    };
    const title = labelMap[subtab] || `${viewType.toUpperCase()} Worksheet`;
    if (typeof showToast === "function") {
        showToast(`Navigated to ${title}`, "info");
    }
}
window.navigateToFMEA = navigateToFMEA;

function navigateToMasterData(masterTabKey = "flow") {
    if (typeof switchView === "function") {
        switchView("master-data");
    }
    if (typeof switchMasterTab === "function") {
        setTimeout(() => {
            switchMasterTab(masterTabKey);
        }, 60);
    }
    if (typeof showToast === "function") {
        showToast("Navigated to Master Data Center", "info");
    }
}
window.navigateToMasterData = navigateToMasterData;

// --- INTERACTIVE MASTER DATA TO FMEA LOCATOR ---
function locateMasterItemInFMEA(pillar, code, encodedDesc) {
    const desc = encodedDesc ? decodeURIComponent(encodedDesc) : "";
    
    // 1. Pillar to FMEA worksheet & subtab mapping
    const pillarMapping = {
        'prod': { view: 'dfmea', subtab: 'formulation', label: '1. Product Master' },
        'product': { view: 'dfmea', subtab: 'formulation', label: '1. Product Master' },
        'rm': { view: 'dfmea', subtab: 'raw_materials', label: '2. Raw Material Master' },
        'app': { view: 'dfmea', subtab: 'application', label: '3. Application Master' },
        'pkg': { view: 'dfmea', subtab: 'packaging', label: '4. Packaging Master' },
        'proc': { view: 'pfmea', subtab: 'operations', label: '5. Process Master' },
        'matrix': { view: 'dfmea', subtab: 'application', label: '3. Application Master' }
    };

    const target = pillarMapping[pillar] || { view: 'dfmea', subtab: 'formulation', label: 'FMEA Worksheet' };
    const { view: targetView, subtab: targetSubtab, label: targetLabel } = target;

    // 2. Ensure formulations exist
    if (!formulationsDB || formulationsDB.length === 0) {
        if (typeof loadAllDatabases === "function") loadAllDatabases();
    }
    if (!formulationsDB || formulationsDB.length === 0) {
        if (typeof showToast === "function") showToast("Please register or create at least one formulation project first.", "warning");
        return;
    }

    const lowerCode = (code || "").toLowerCase().trim();
    const lowerDesc = (desc || "").toLowerCase().trim();

    // 3. Search for best formulation match
    let targetForm = null;
    let activeForm = getActiveFormulation();

    // Check active formulation first
    if (activeForm && activeForm[targetView] && activeForm[targetView][targetSubtab]) {
        const hasItem = activeForm[targetView][targetSubtab].some(r => 
            (r.step && r.step.toLowerCase().includes(lowerCode)) ||
            (r.detail && r.detail.toLowerCase().includes(lowerCode)) ||
            (lowerDesc && r.detail && r.detail.toLowerCase().includes(lowerDesc)) ||
            (lowerDesc && r.step && r.step.toLowerCase().includes(lowerDesc))
        );
        if (hasItem || (activeForm.name && activeForm.name.toLowerCase().includes(lowerCode))) {
            targetForm = activeForm;
        }
    }

    // If not in active formulation, search across all formulations
    if (!targetForm) {
        for (const form of formulationsDB) {
            if (form[targetView] && form[targetView][targetSubtab]) {
                const found = form[targetView][targetSubtab].some(r => 
                    (r.step && r.step.toLowerCase().includes(lowerCode)) ||
                    (r.detail && r.detail.toLowerCase().includes(lowerCode)) ||
                    (lowerDesc && r.detail && r.detail.toLowerCase().includes(lowerDesc))
                );
                if (found) {
                    targetForm = form;
                    break;
                }
            }
            if (form.name && form.name.toLowerCase().includes(lowerCode)) {
                targetForm = form;
                break;
            }
        }
    }

    // Default to active formulation, or first formulation
    if (!targetForm) {
        targetForm = activeForm || formulationsDB[0];
    }

    // Switch active formulation if different
    if (targetForm && targetForm.id !== activeFormulationId) {
        activeFormulationId = targetForm.id;
        localStorage.setItem("fmea_active_form_id", activeFormulationId);
        const formSel = document.getElementById("active-formulation-select");
        if (formSel) formSel.value = activeFormulationId;
    }

    // 4. Ensure container arrays exist on the target formulation
    if (!targetForm[targetView]) targetForm[targetView] = {};
    if (!targetForm[targetView][targetSubtab]) targetForm[targetView][targetSubtab] = [];

    // Check if the item already exists in targetSubtab
    let matchingRowIndex = targetForm[targetView][targetSubtab].findIndex(r => 
        (r.step && r.step.toLowerCase().includes(lowerCode)) ||
        (r.detail && r.detail.toLowerCase().includes(lowerCode)) ||
        (lowerDesc && r.detail && r.detail.toLowerCase().includes(lowerDesc))
    );

    // If item does not exist in worksheet yet, automatically add it with sensible defaults!
    let rowAdded = false;
    if (matchingRowIndex === -1 && code) {
        const functionByPillar = {
            'prod': 'Product Formulation Binder / Conduction Matrix',
            'product': 'Product Formulation Binder / Conduction Matrix',
            'rm': 'Raw Material Active Constituent',
            'app': 'Application Substrate Interface & Environmental Reliability',
            'pkg': 'Adhesive Containment, Moisture Barrier & Dispensing Protection',
            'proc': 'Planetary Shear Mixing, Degassing & Dispense Operation',
            'matrix': 'Qualified Application Assembly'
        };

        const newRow = {
            id: "row-" + Date.now(),
            number: (targetForm[targetView][targetSubtab].length + 1).toString(),
            step: code,
            function: functionByPillar[pillar] || "Standard Specification Function",
            detail: desc || code,
            characteristic: "CTQ",
            mode: "Potential specification drift / performance loss",
            effect: "Compromised bond reliability or processing issue",
            sev: 7,
            cause: "Process variation or environmental degradation",
            occ: 3,
            prevention: "Standard operating controls and parameter inspection",
            detection_controls: "Incoming and in-line quality verification",
            det: 3,
            action: "Establish continuous SPC parameter tracking",
            resp: currentUser ? currentUser.username : "Process Engineering",
            result: "",
            result_date: "",
            result_sev: 7,
            result_occ: 3,
            result_det: 3,
            concern: "Master Data synchronization item",
            happened: "No"
        };
        targetForm[targetView][targetSubtab].push(newRow);
        if (typeof saveFormulationsDB === "function") saveFormulationsDB();
        matchingRowIndex = targetForm[targetView][targetSubtab].length - 1;
        rowAdded = true;
    }

    // 5. Navigate to FMEA view and switch subtab
    if (typeof switchView === "function") {
        switchView(targetView);
    }
    if (typeof switchSubtab === "function") {
        switchSubtab(targetView, targetSubtab);
    }

    // 6. Highlight, focus and scroll to row
    setTimeout(() => {
        // Set search input to code so the matching row is visible
        const searchInput = document.getElementById(`${targetView}-search`);
        if (searchInput) {
            searchInput.value = code;
            if (typeof renderFMEAWorksheet === "function") {
                renderFMEAWorksheet(targetView);
            }
        }

        const tbody = document.getElementById(`${targetView}-tbody`);
        if (tbody) {
            const rows = tbody.querySelectorAll("tr");
            let targetTr = null;

            rows.forEach(tr => {
                const text = tr.textContent || "";
                if (text.toLowerCase().includes(lowerCode) || (lowerDesc && text.toLowerCase().includes(lowerDesc.substring(0, 20)))) {
                    targetTr = tr;
                }
            });

            if (!targetTr && rows.length > 0) {
                targetTr = rows[0];
            }

            if (targetTr) {
                targetTr.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetTr.classList.remove("row-locate-highlight");
                void targetTr.offsetWidth; // force reflow
                targetTr.classList.add("row-locate-highlight");

                const detailInput = targetTr.querySelector('textarea[data-field="detail"]');
                if (detailInput) {
                    detailInput.focus();
                    detailInput.classList.remove("detail-locate-pulse");
                    void detailInput.offsetWidth;
                    detailInput.classList.add("detail-locate-pulse");
                }
            }
        }

        if (typeof showToast === "function") {
            if (rowAdded) {
                showToast(`Linked & located "${code}" in ${targetLabel}!`, "success");
            } else {
                showToast(`Located "${code}" in ${targetLabel}!`, "info");
            }
        }
    }, 120);
}
window.locateMasterItemInFMEA = locateMasterItemInFMEA;









