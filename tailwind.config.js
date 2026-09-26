/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  corePlugins: {
    // Preserve existing tactical.css base stylesheet completely intact
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        surface: '#0f1418',
        'surface-dim': '#0f1418',
        'surface-bright': '#353a3e',
        'surface-container-lowest': '#0a0f13',
        'surface-container-low': '#171c20',
        'surface-container': '#1b2024',
        'surface-container-high': '#262b2f',
        'surface-container-highest': '#30353a',
        'surface-variant': '#30353a',
        'surface-tint': '#4ae176',

        'on-surface': '#dfe3e9',
        'on-surface-variant': '#bccbb9',
        'inverse-surface': '#dfe3e9',
        'inverse-on-surface': '#2c3135',

        outline: '#869585',
        'outline-variant': '#3d4a3d',

        primary: '#4be277',
        'on-primary': '#003915',
        'primary-container': '#22c55e',
        'on-primary-container': '#004b1e',
        'primary-fixed': '#6bff8f',
        'primary-fixed-dim': '#4ae176',
        'on-primary-fixed': '#002109',
        'on-primary-fixed-variant': '#005321',
        'inverse-primary': '#006e2f',

        secondary: '#4cd7f6',
        'on-secondary': '#003640',
        'secondary-container': '#03b5d3',
        'on-secondary-container': '#00424e',
        'secondary-fixed': '#acedff',
        'secondary-fixed-dim': '#4cd7f6',
        'on-secondary-fixed': '#001f26',
        'on-secondary-fixed-variant': '#004e5c',

        tertiary: '#ffba61',
        'on-tertiary': '#472a00',
        'tertiary-container': '#ef9900',
        'on-tertiary-container': '#5c3800',
        'tertiary-fixed': '#ffddb8',
        'tertiary-fixed-dim': '#ffb95f',
        'on-tertiary-fixed': '#2a1700',
        'on-tertiary-fixed-variant': '#653e00',

        error: '#ffb4ab',
        'on-error': '#690005',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',

        background: '#0f1418',
        'on-background': '#dfe3e9',
      },
      spacing: {
        gutter: '0.5rem',
        'gutter-desktop': '0.75rem',
        margin: '0.75rem',
        'margin-desktop': '1rem',
        'space-xs': '0.125rem',
        'space-sm': '0.25rem',
        'space-md': '0.5rem',
        'space-lg': '0.75rem',
        'space-xl': '1rem',
      },
      fontFamily: {
        'headline-xl': ['"Space Grotesk"', 'sans-serif'],
        'headline-lg': ['"Space Grotesk"', 'sans-serif'],
        'headline-md': ['"Space Grotesk"', 'sans-serif'],
        'body-lg': ['Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif'],
        'body-sm': ['Inter', 'sans-serif'],
        'label-code': ['"JetBrains Mono"', 'monospace'],
        'label-micro': ['"JetBrains Mono"', 'monospace'],
        'telemetry-data': ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
