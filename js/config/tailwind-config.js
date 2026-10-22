tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['system-ui', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        paho: {
          blue: '#008DC9',          /* Azul Institucional */
          'dark-blue': '#004C97',     /* Azul Oscuro */
          'very-dark-blue': '#003865',/* Azul Muy Oscuro */
          'light-blue': '#7CC5E8',    /* Celeste Claro */
          'orange': '#FF671F',        /* ← AGREGAR ESTA LÍNEA (Color de acento de la OPS) */
          'gray-dark': '#4D4D4D',     /* Gris Oscuro de Texto */
          'gray-medium': '#808080',   /* Gris de Soporte */
          'gray-light': '#D9D9D6',    /* Gris de Líneas */
          white: '#FFFFFF',           /* Blanco Puro */
          card: '#F7F9FB',            /* Fondo de Tarjetas */
          grid: '#E6E6E6',            /* Divisores de Cuadrícula */
          hover: '#00A3E0'            /* Celeste Vivo - Efecto interactivo hover */
        }
      }
    }
  }
}