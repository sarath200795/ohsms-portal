const defaultElec = {
    who: 'Electricians, Operators',
    controls: [
        { type: 'Elimination', desc: 'Isolate power source' },
        { type: 'Engineering', desc: 'RCD / ELCB installed' },
        { type: 'Administrative', desc: 'LOTO procedure' },
        { type: 'PPE', desc: 'Arc flash suit and insulated gloves' }
    ]
};

const defaultTher = {
    who: 'Workers, Occupants',
    controls: [
        { type: 'Elimination', desc: 'Remove combustibles' },
        { type: 'Engineering', desc: 'Thermal insulation/shields' },
        { type: 'Administrative', desc: 'Hot Work Permit' },
        { type: 'PPE', desc: 'Heat resistant gloves' }
    ]
};

const defaultGrav = {
    who: 'Workers at height, Staff below',
    controls: [
        { type: 'Elimination', desc: 'Work from ground level' },
        { type: 'Engineering', desc: 'Guardrails/Edge protection' },
        { type: 'Administrative', desc: 'Exclusion zones below' },
        { type: 'PPE', desc: 'Fall arrest harness' }
    ]
};

const defaultMach = {
    who: 'Machine Operators',
    controls: [
        { type: 'Elimination', desc: 'Automate process' },
        { type: 'Engineering', desc: 'Fixed interlocked guards' },
        { type: 'Administrative', desc: 'Pre-use checks' },
        { type: 'PPE', desc: 'No loose clothing/jewelry' }
    ]
};

const defaultRad = {
    who: 'Specialist Staff',
    controls: [
        { type: 'Elimination', desc: 'Use non-radioactive methods' },
        { type: 'Engineering', desc: 'Lead shielding / Enclosures' },
        { type: 'Administrative', desc: 'Limit exposure time / Dosimeters' },
        { type: 'PPE', desc: 'Specialist shielded PPE' }
    ]
};

const defaultVeh = {
    who: 'Drivers, Pedestrians',
    controls: [
        { type: 'Elimination', desc: 'Complete pedestrian segregation' },
        { type: 'Engineering', desc: 'Speed limiters / Sensors' },
        { type: 'Administrative', desc: 'Traffic management plan' },
        { type: 'PPE', desc: 'High visibility clothing' }
    ]
};

const defaultBio = {
    who: 'Cleaners, First Aiders',
    controls: [
        { type: 'Elimination', desc: 'Avoid contaminated areas' },
        { type: 'Engineering', desc: 'Bio-hazard disposal bins' },
        { type: 'Administrative', desc: 'Vaccinations & Hygiene protocols' },
        { type: 'PPE', desc: 'Nitrile gloves and face shields' }
    ]
};

const defaultChem = {
    who: 'Chemical Handlers',
    controls: [
        { type: 'Substitution', desc: 'Use less hazardous alternative' },
        { type: 'Engineering', desc: 'Local Exhaust Ventilation (LEV)' },
        { type: 'Administrative', desc: 'COSHH Assessment' },
        { type: 'PPE', desc: 'Chemical suit and respirator' }
    ]
};

const defaultErgo = {
    who: 'Manual Workers',
    controls: [
        { type: 'Elimination', desc: 'Automated lifting equipment' },
        { type: 'Engineering', desc: 'Adjustable workstations' },
        { type: 'Administrative', desc: 'Job rotation / Kinetic lifting training' },
        { type: 'PPE', desc: 'Ergonomic floor mats' }
    ]
};

const defaultEnv = {
    who: 'All Staff',
    controls: [
        { type: 'Elimination', desc: 'Remove source of noise/vibration' },
        { type: 'Engineering', desc: 'Acoustic enclosures / HVAC' },
        { type: 'Administrative', desc: 'Monitor exposure limits' },
        { type: 'PPE', desc: 'Ear defenders / warm clothing' }
    ]
};

const defaultPsy = {
    who: 'All Staff',
    controls: [
        { type: 'Elimination', desc: 'Redesign work patterns' },
        { type: 'Engineering', desc: 'Panic buttons (Violence)' },
        { type: 'Administrative', desc: 'EAP & regular check-ins' },
        { type: 'Administrative', desc: 'Zero tolerance policy' }
    ]
};

export const HAZARD_DICTIONARY = {
    Electrical: {
        'Broken plugs, sockets, switches': defaultElec,
        'Electrical exposed to liquids': defaultElec,
        'Electromagnetic phenomena': defaultElec,
        'Exposed wiring/cords': defaultElec,
        'Fixed installations': defaultElec,
        'High voltage': defaultElec,
        'Live parts': defaultElec,
        'Incorrect wiring': defaultElec,
        'Insulation damage': defaultElec,
        'Low voltage': defaultElec,
        Overloading: defaultElec,
        'Rodent damage': defaultElec,
        'Short circuit': defaultElec,
        'Thermal radiation': defaultElec,
        Other: defaultElec
    },
    Thermal: {
        Explosion: defaultTher,
        'Fire/Flame': defaultTher,
        'Radiation from heat source': defaultTher,
        'Contact with hot objects': defaultTher,
        'Contact with cold objects': defaultTher,
        'Hot works (e.g., welding)': defaultTher,
        Other: defaultTher
    },
    Gravity_Access: {
        'Confined space': defaultGrav,
        Excavations: defaultGrav,
        'Falling/moving object or structure': defaultGrav,
        'Obstruction of': defaultGrav,
        'Projection of': defaultGrav,
        'Suspended load': defaultGrav,
        'Uneven or slippery surfaces': defaultGrav,
        'Working at height': defaultGrav,
        Other: defaultGrav
    },
    Equipment_Machine: {
        'Acceleration, deceleration': defaultMach,
        'Air or high pressure fluid injection': defaultMach,
        'Caught by': defaultMach,
        'Crushed by': defaultMach,
        'Drawing in': defaultMach,
        'Elastic elements': defaultMach,
        'Entangled by': defaultMach,
        'Equipment malfunction': defaultMach,
        'Friction/abrasion': defaultMach,
        Instability: defaultMach,
        'Machine/mobility': defaultMach,
        'Puncture/sever': defaultMach,
        'Rough surface': defaultMach,
        'Severed by': defaultMach,
        'Slippery surface': defaultMach,
        'Struck by': defaultMach,
        'Unexpected start': defaultMach,
        Other: defaultMach
    },
    Radiation: {
        'Extra low frequency (ELF) radiation': defaultRad,
        'Infrared radiation': defaultRad,
        'Interference from other equipment': defaultRad,
        'Ionizing radiation (alpha, beta or gamma ray)': defaultRad,
        Lasers: defaultRad,
        'LGACs Laser generated air contaminants': defaultRad,
        'Low frequency electromagnetic radiation': defaultRad,
        'Other non-ionizing radiation': defaultRad,
        'Un-ionized arc-rays': defaultRad,
        'Ultraviolet radiation': defaultRad,
        'Microwave radiation': defaultRad,
        'Radiofrequency radiation': defaultRad,
        'Visible light': defaultRad,
        Other: defaultRad
    },
    Motorized_Vehicle_Operation: {
        'Intersection (PIT/Pedestrian)': defaultVeh,
        'Intersection (PIT/Vehicle)': defaultVeh,
        'Intersection (PIT/PIT)': defaultVeh,
        'Intersection (PIT/Object)': defaultVeh,
        'Intersection (Vehicle/Pedestrian)': defaultVeh,
        'Intersection (Vehicle/Vehicle)': defaultVeh,
        'Intersection (Vehicle/Object)': defaultVeh,
        'Poor road conditions': defaultVeh,
        'Poor vehicle design': defaultVeh,
        'Vehicle malfunction': defaultVeh,
        Other: defaultVeh
    },
    Biological: {
        'Bites by': defaultBio,
        'Bacteria and viruses': defaultBio,
        'Blood or other bodily fluids': defaultBio,
        'Contaminated drinking water': defaultBio,
        'Contaminated sharps or equipment': defaultBio,
        'Fungi/molds': defaultBio,
        'Human waste': defaultBio,
        'Stung by': defaultBio,
        Other: defaultBio
    },
    Chemical: {
        Asbestos: defaultChem,
        'Carcinogenic substances': defaultChem,
        'Combustible materials': defaultChem,
        'Compressed gas': defaultChem,
        'Contaminated drinking water': defaultChem,
        Corrosives: defaultChem,
        Dust: defaultChem,
        'Enriched oxygen environment (>23.5% oxygen)': defaultChem,
        Explosives: defaultChem,
        Fibers: defaultChem,
        Flammables: defaultChem,
        Fluid: defaultChem,
        'Fumes and vapors': defaultChem,
        'Low oxygen environment (<19.5% oxygen)': defaultChem,
        Mist: defaultChem,
        'Mutagenic or teratogenic substances': defaultChem,
        Oxidizer: defaultChem,
        Pharmaceuticals: defaultChem,
        Poisons: defaultChem,
        Smoking: defaultChem,
        'Vehicle exhausts': defaultChem,
        Other: defaultChem
    },
    Ergonomic: {
        'Awkward posture (technique)': defaultErgo,
        'Design/location of controls': defaultErgo,
        'Effort/force/exertion': defaultErgo,
        'Head room/clearance': defaultErgo,
        'Manual handling': defaultErgo,
        'Mechanical handling': defaultErgo,
        'Poor housekeeping': defaultErgo,
        'Poor lighting and glare': defaultErgo,
        'Poor workstation design': defaultErgo,
        'Repetition/repetitive movement': defaultErgo,
        'Restricted access': defaultErgo,
        'Slippery surface': defaultErgo,
        'Sustained/static postures': defaultErgo,
        Other: defaultErgo
    },
    Noise_Vibration_Work_Env: {
        'Combustible material': defaultEnv,
        'Flammable material': defaultEnv,
        Humidity: defaultEnv,
        'Poor lighting': defaultEnv,
        'Mobile equipment': defaultEnv,
        'Moving parts': defaultEnv,
        Noise: defaultEnv,
        'Over-crowding': defaultEnv,
        'Poor ventilation': defaultEnv,
        'Scraping surfaces': defaultEnv,
        'Speed of process': defaultEnv,
        'Temperature - High': defaultEnv,
        'Temperature - Low': defaultEnv,
        Vibration: defaultEnv,
        Other: defaultEnv
    },
    Psychosocial: {
        Bullying: defaultPsy,
        'Criminal or malicious intent': defaultPsy,
        'Conflicting demands': defaultPsy,
        Distraction: defaultPsy,
        Discrimination: defaultPsy,
        Harassment: defaultPsy,
        'High/low work demand': defaultPsy,
        'Inadequate rest breaks': defaultPsy,
        'Inadequate staffing': defaultPsy,
        'Interpersonal issues': defaultPsy,
        Intimidation: defaultPsy,
        'Job insecurity': defaultPsy,
        'Lack of role clarity': defaultPsy,
        'Low control': defaultPsy,
        'Personal medical condition': defaultPsy,
        'Poor communication': defaultPsy,
        'Poorly managed change': defaultPsy,
        'Poor support': defaultPsy,
        'Remote/isolated work': defaultPsy,
        'Social support and conflict': defaultPsy,
        Terrorism: defaultPsy,
        'Violence in the workplace': defaultPsy,
        'Work duration or shift pattern': defaultPsy,
        Other: defaultPsy
    }
};

export const HAZARD_CATS = Object.keys(HAZARD_DICTIONARY);

export const PROBABILITY = [
    { v: 1, l: '1 - Rare' },
    { v: 2, l: '2 - Unlikely' },
    { v: 3, l: '3 - Possible' },
    { v: 4, l: '4 - Likely' },
    { v: 5, l: '5 - Almost Certain' }
];

export const SEVERITY = [
    { v: 1, l: '1 - Negligible' },
    { v: 2, l: '2 - Minor' },
    { v: 3, l: '3 - Moderate' },
    { v: 4, l: '4 - Major' },
    { v: 5, l: '5 - Catastrophic' }
];

export const CHANGE_SOURCES = [
    'Incident Investigation',
    'Management of Change',
    'Annual Review',
    'Audit Finding',
    'Process Update',
    'Other'
];

export const getRiskClass = (score) => {
    if (score >= 15) return 'bg-red-900 text-white border border-red-500';
    if (score >= 10) return 'bg-red-500 text-white border border-red-400';
    if (score >= 5) return 'bg-yellow-500 text-black border border-yellow-400';
    return 'bg-emerald-500 text-white border border-emerald-400';
};

export const getRiskStyle = (score) => {
    if (score >= 15) return { backgroundColor: '#7f1d1d', color: 'white' };
    if (score >= 10) return { backgroundColor: '#ef4444', color: 'white' };
    if (score >= 5) return { backgroundColor: '#eab308', color: 'black' };
    return { backgroundColor: '#10b981', color: 'white' };
};

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
});
