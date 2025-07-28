module.exports = {
    purge: {
      enabled:true,
      content: [
        './src/html/**/*.html',
        './src/scripts/**/*.js'
      ],
    },
    darkMode: false, // or 'media' or 'class'
    theme: {
      extend: {},
    },
    variants: {
      extend: {
        opacity: ['disabled'],
        cursor: ['disabled'],
        backgroundColor: ['disabled'],
      },
    },
    plugins: [],
  }