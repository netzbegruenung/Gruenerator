const path = require('path');

module.exports = {
  FONT_PATH: path.resolve(__dirname, '../../../public/fonts/GrueneType.ttf'),
  SUNFLOWER_PATH: path.resolve(__dirname, '../../../public/Sonnenblume.png'),
  TESTBILD_PATH: path.resolve(__dirname, '../../../public/testbild.jpg'),
  TEMP_UPLOAD_DIR: path.resolve(__dirname, '../../../temp_uploads'),


  COLORS: {
    TANNE: '#005538',
    KLEE: '#008939', 
    GRASHALM: '#8ABD24',
    SAND: '#F5F1E9'
  },

  params: {
    CANVAS_SIZE: 1080,
    MIN_FONT_SIZE: 75,
    MAX_FONT_SIZE: 110,
    DEFAULT_FONT_SIZE: 85,
    DEFAULT_BALKEN_GRUPPEN_OFFSET: [30, 0],
    DEFAULT_BALKEN_OFFSET: [50, -100, 50],
    DEFAULT_SUNFLOWER_POSITION: 'bottomRight',
    DEFAULT_SUNFLOWER_OFFSET: [0, 0],
    DEFAULT_COLORS: [
      { background: '#005538', text: '#F5F1E9' },
      { background: '#F5F1E9', text: '#005538' },
      { background: '#F5F1E9', text: '#005538' }
    ],
    BALKEN_HEIGHT_FACTOR: 1.6,
    TEXT_PADDING_FACTOR: 0.3,
    SUNFLOWER_SIZE_FACTOR: 0.8,
    SUNFLOWER_OVERLAP_FACTOR: 0.25,
    OUTPUT_WIDTH: 1080,
    OUTPUT_HEIGHT: 1080,

    

    // Hinzufügen der Validierungsgrenzen
    MAX_BALKEN_GRUPPEN_OFFSET: 300,
    MIN_BALKEN_GRUPPEN_OFFSET: -300,
    MAX_BALKEN_OFFSET: 300,
    MIN_BALKEN_OFFSET: -300,
    MAX_SUNFLOWER_OFFSET: 300,
    MIN_SUNFLOWER_OFFSET: -100
  }
};
