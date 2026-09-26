/**
 * IBVAP Tactical Command Types & Definitions
 */

export const INITIAL_DOSSIER = {
  id: '#INC-2026-8841',
  targetId: 'PERSON-019',
  classification: 'HUMAN',
  confidence: '96.8%',
  velocity: '2.1 m/s (RUNNING)',
  bearing: '148° SE (TOWARD FENCE)',
  coordinates: `32°14'08.2"N 74°51'22.4"E (SECTOR BRAVO)`,
  threatEvaluation: 'High priority unverified movement inside non-permissive frontier buffer. Target bypassed acoustic ground sensor line before tripwire crossing. Optical confirmation verified.',
  sopSteps: [
    {
      title: 'AI Threat Auto-Classification',
      status: 'DONE',
      statusType: 'success',
      completed: true
    },
    {
      title: 'PTZ Camera Auto-Slew & Target Lock',
      status: 'DONE',
      statusType: 'success',
      completed: true
    },
    {
      title: 'Tactical Operator Visual Sign-off',
      status: 'REQ',
      statusType: 'warning',
      completed: false
    },
    {
      title: 'Quick Reaction Team (QRF Alpha) Alert',
      status: 'PENDING',
      statusType: 'error',
      completed: false
    }
  ]
};

export const CREST_LOGO_URL = 'https://lh3.googleusercontent.com/aida/AEtjO1VHCtSdMwix8fRayaIGYp81cLB2uASZNBCo5QHxlje-gCqbJK_KUyFqtgZ0hh5j4Z6vRfiNGbFcv8LPIHZGYEUzuHkattCthUhAQYUcpTA_sxBHsECODlFkvL54_21xDoYeF3_y_4VIDTKUdp_V6k10z3p0A9U38mAkXrrssgAHKU3yJx_1gOnW9O-kUw50JRC-85SXKCvqxMrugP02PVMOfKcNVqVD81AV7S-up2EJWzC9h_VhvPOiE247';

export const ANPR_FEED_MAIN_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAPSg4ihTl8JMrswaSKEGSBRZgDkGrCPg1gVk5sXnXgNbz5BHgLTFkBDlXr6K5CzY5B29ULrJV9dCMFxhCIKIubPTiZuU7Vy2TZF1_g39m6PQy4n2NurZwJIvoM7U5muuUg7v_WZE-cZN_R95GnI120b-AjBYfDTyESZfWdRsWgAji0QnjXdbsa-8T-7nAwvQ_csT9_eqRNVh4bTT9FsMxVPQVnAqzbo15uZETb7dUfyRhELlaQkitDAg';
export const CAM_AXLE_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDYHeZH6ouTa9_xl20galPL_wtQKAq6iBXvTWOloMiU7nsbr139hVDUjHrYDm-PrGG8Y1E3_PpwF_-ETovzkHRqLtueZQcN3KYYlYA4UgtbTzF_Zi7VRvePw-35LCjB6zJ1w2xFJYMVAJ3qxoALEAmV0KVM4VgZ5i3oOjDccL3IP5RACiworYsBf0uKSNUrs7F5d4GCa8Pjr2pwZlCNCW3EnC_bHPZRhXmEy97ZrhSyul96RY9KmvRf8A';
export const UVIS_SCAN_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuD1XJjhA1Z8rl4_hKImjvE9wuR9aJ8_b_DXR1NLYCdSq2FWkIdLArtmjhBuEJ7XkTiaGxy5XX_KBxKxIgkvDDTdqjgQf55xBUke3GFIr94LxlhHioK9FitO0S3r4-QmNGUss8Inwyzqh-Q98UaKT1bvvqKKAi21kssl0te3xODe9b0deJd5KMpXdu88uKeikr7hWqa9cNFzd6Tgffyd3k_9dSgGMkJGh7aa0HAhjKE9TP8uzIdGcLZeiQ';
export const BORDER_TWIN_PIP_IMG = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBxQQZK05k-p0_kj673tbwuydS_NgwyNU68mAL9JY8GTgoPVmW4Xt6Or5QCRpQfVaRgYs0FLshjFlTE8wZY4OBPpILWujBhOXQ4Q5Adw_wMvpyBhk4SxQf6r2INVCIYGyeI-uOS9I-P-gN_ovQYFgrAAxKQP0bNZci9ULOPkbDpo92qVrX33mVsfgcIk9UVZC4Vc07P2Bh6auH7tpjaOo8dRlBTj1jFlEwzu22k7qSYU7aLoEwwFdGznA';

export const INITIAL_ANPR_LOGS = [
  {
    id: 'veh-01',
    plate: 'UK07AB1234',
    type: 'BRO Utility',
    model: 'MAHINDRA BOLERO',
    time: '17:39:51',
    cam: 'BOP-03 [GATE 1]',
    speed: '18 KM/H',
    conf: '98.4%',
    tag: 'AUTHORIZED (BRO)',
    tagType: 'authorized',
    details: 'RFID MATCHED • BARRIER LIFT',
    rfid: 'RF-9942-IND',
    isDemo: true
  },
  {
    id: 'veh-02',
    plate: 'PB02X8841',
    type: 'Heavy Transport',
    model: 'TATA 407 TRUCK',
    time: '17:34:10',
    cam: 'BOP-03 [GATE 1]',
    speed: '12 KM/H',
    conf: '96.1%',
    tag: 'CARGO LOGISTICS',
    tagType: 'cargo',
    details: 'SUPPLY PASS #LOG-1190',
    rfid: 'RF-4412-PB',
    isDemo: true
  },
  {
    id: 'veh-03',
    plate: 'JK05E4410',
    type: 'Tactical Recon',
    model: 'MARUTI GYPSY 4X4',
    time: '17:28:44',
    cam: 'BOP-01 [ALPHA GATE]',
    speed: '32 KM/H',
    conf: '99.0%',
    tag: 'PRIORITY ESCORT',
    tagType: 'escort',
    details: 'ARMY RECON UNIT #14',
    rfid: 'RF-0091-DEF',
    isDemo: true
  },
  {
    id: 'veh-04',
    plate: 'DL01CA9921',
    type: 'Suspect SUV',
    model: 'MAHINDRA SCORPIO',
    time: '17:15:02',
    cam: 'BOP-02 [BYPASS]',
    speed: '58 KM/H (VIOLATION)',
    conf: '94.6%',
    tag: 'HOTLIST HIT',
    tagType: 'hotlist',
    details: 'SPECIAL CELL INTERCEPT FLAGGED',
    isDemo: true
  },
  {
    id: 'veh-05',
    plate: 'HR26DQ1109',
    type: 'Civilian Sedan',
    model: 'HYUNDAI CRETA',
    time: '16:58:22',
    cam: 'BOP-03 [GATE 1]',
    speed: '24 KM/H',
    conf: '91.2%',
    tag: 'CIVILIAN PASS',
    tagType: 'civilian',
    details: 'REGISTRY VERIFIED (VAHAN)',
    isDemo: true
  },
  {
    id: 'veh-06',
    plate: 'UNREADABLE',
    type: 'Pickup 4x4',
    model: 'TOYOTA HILUX',
    time: '16:42:19',
    cam: 'BOP-04 [OFF-ROAD LANE]',
    speed: '41 KM/H',
    conf: '54.0%',
    tag: 'MANUAL CHECK',
    tagType: 'manual',
    details: 'PLATE MUD COVERED — SENTRY ALERTED',
    isDemo: true
  }
];

export const SOC_TELEMETRY_STREAM = [
  {
    time: '14:32:08',
    cam: 'CAM-04',
    type: 'CRIT',
    badgeClass: 'bg-error-container text-on-error-container',
    title: 'VIRTUAL TRIPWIRE BREACH',
    details: 'TARGET ID: P-019 (HUMAN) • GRID PK-IND-324'
  },
  {
    time: '14:31:44',
    cam: 'CAM-12',
    type: 'PATROL',
    badgeClass: 'bg-tertiary-container text-on-tertiary-container',
    title: 'VEHICLE CLASSIFIED',
    details: 'TARGET ID: V-007 (GYPSY MILITARY PATROL)'
  },
  {
    time: '14:30:21',
    cam: 'CAM-03',
    type: 'VERIFIED',
    badgeClass: 'bg-surface-container-highest text-primary',
    title: 'ANPR OCR MATCH',
    details: 'PLATE: UK-07-AB-1234 • WHITE-LIST APPROVED'
  },
  {
    time: '14:28:51',
    cam: 'CAM-01',
    type: 'INFO',
    badgeClass: 'bg-surface-container-highest text-on-surface-variant',
    title: 'PERSON RE-ID NEW TRACK',
    details: 'TARGET ID: P-023 (AUTHORIZED BSF PATROL)'
  },
  {
    time: '14:26:10',
    cam: 'SYS-NET',
    type: 'SYNC',
    badgeClass: 'bg-surface-container-highest text-primary',
    title: 'RADAR / CAM OPTICAL SYNC',
    details: 'AZIMUTH CALIBRATION COMPLETE FOR BOP-07 ARRAY'
  }
];
