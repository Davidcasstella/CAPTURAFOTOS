const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

// Para poder leer JSON con base64 grandes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servimos la carpeta raíz como estático (donde están index.html, js, css, etc.)
app.use(express.static(__dirname));

// Endpoint para guardar la foto
app.post('/save-photo', (req, res) => {
  const { imageData } = req.body;

  if (!imageData) {
    return res.status(400).json({ error: 'No image data provided' });
  }

  // Validar que sea un dataURL
  const matches = imageData.match(/^data:(.+);base64,(.+)$/);
  if (!matches) {
    return res.status(400).json({ error: 'Invalid data URL' });
  }

  const mimeType = matches[1];      // "image/png", por ejemplo
  const base64Data = matches[2];      // la parte base64
  const ext = mimeType.split('/')[1];
  
  // Crear un nombre de archivo único
  const fileName = `photo_${Date.now()}.${ext}`;
  // Ruta a la carpeta "guardarfotos"
  const filePath = path.join(__dirname, 'guardarfotos', fileName);

  // Guardar el archivo en formato base64
  fs.writeFile(filePath, base64Data, 'base64', (err) => {
    if (err) {
      console.error('Error saving image:', err);
      return res.status(500).json({ error: 'Error saving image' });
    }
    console.log(`Imagen guardada en: ${filePath}`);
    res.json({ success: true, filePath });
  });
});

// Inicia el servidor en el puerto 3000
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
