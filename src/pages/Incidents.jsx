// Inside src/pages/Incidents.jsx

useEffect(() => {
    const s = sessionStorage.getItem('isoSession');
    if (!s) return navigate('/');
    const sess = JSON.parse(s);

    // RBAC Verification
    const hasAccess = ['Global Owner', 'Global Manager', 'Admin'].includes(sess.role) ||
        safeArr(sess.accessibleModules).includes('Incidents');
    if (!hasAccess) {
        alert("You do not have permission to access the Incidents module.");
        return navigate('/dashboard');
    }

    setSession(sess);

    // --- PHASE 2: TARGETED FETCHING ---
    const fetchTargetedData = async () => {
        try {
            const orgRef = `organizations/${sess.orgId}`;

            // Fire all 4 requests simultaneously
            const [incidentsSnap, sitesSnap, usersSnap, contractorsSnap] = await Promise.all([
                get(ref(rtdb, `${orgRef}/incidents`)),
                get(ref(rtdb, `${orgRef}/sites`)),
                get(ref(rtdb, `${orgRef}/users`)),
                get(ref(rtdb, `${orgRef}/contractors`))
            ]);

            // Parse exactly what we need, ignoring the rest of the database
            if (incidentsSnap.exists()) setIncidents(safeArrayParse(incidentsSnap.val()));
            if (sitesSnap.exists()) {
                setSites(Object.keys(sitesSnap.val()).map(k => ({ code: sitesSnap.val()[k].code || k, name: sitesSnap.val()[k].name || k })));
            }
            if (usersSnap.exists()) setUsers(safeArrayParse(usersSnap.val()));
            if (contractorsSnap.exists()) setContractors(safeArrayParse(contractorsSnap.val()));

        } catch (error) {
            console.error("Incident Data Fetch Error:", error);
        } finally {
            setLoading(false);
        }
    };

    fetchTargetedData();
}, [navigate]);