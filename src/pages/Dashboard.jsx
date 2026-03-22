// Inside src/pages/Dashboard.jsx

useEffect(() => {
    const s = sessionStorage.getItem('isoSession');
    if (!s) return navigate('/');
    const sess = JSON.parse(s);
    setSession(sess);

    // --- PHASE 2: TARGETED DASHBOARD FETCHING ---
    const fetchDashboardMetrics = async () => {
        try {
            const orgRef = `organizations/${sess.orgId}`;

            // Only fetch the tables we need for the top-level metric cards
            const [ptwSnap, incidentsSnap, contractorsSnap, actionItemsSnap] = await Promise.all([
                get(ref(rtdb, `${orgRef}/ptwRecords`)),
                get(ref(rtdb, `${orgRef}/incidents`)),
                get(ref(rtdb, `${orgRef}/contractors`)),
                get(ref(rtdb, `${orgRef}/capa`)) // Assuming CAPA holds your action items
            ]);

            // Parse and set state for the charts/cards
            if (ptwSnap.exists()) setPermits(safeArrayParse(ptwSnap.val()));
            if (incidentsSnap.exists()) setIncidents(safeArrayParse(incidentsSnap.val()));
            if (contractorsSnap.exists()) setContractors(safeArrayParse(contractorsSnap.val()));
            if (actionItemsSnap.exists()) setActionItems(safeArrayParse(actionItemsSnap.val()));

        } catch (error) {
            console.error("Dashboard Metrics Fetch Error:", error);
        } finally {
            setLoading(false);
        }
    };

    fetchDashboardMetrics();
}, [navigate]);