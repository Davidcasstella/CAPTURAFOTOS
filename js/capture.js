const video = document.getElementById('video');
const photosDiv = document.getElementById('photos');
const debugConsole = document.getElementById('debug-console');
let capturing = false;
let mediaRecorder; // Para grabar el video
let recordedChunks = []; // Almacenará los fragmentos grabados
let isRecording = false; // Indica si el video está siendo grabado

/**
 * Función para imprimir logs en la consola y en la sección de la página.
 */
function logDebug(message) {
  console.log(message);
  if (debugConsole) {
    debugConsole.textContent += message + "\n";
  }
}

/**
 * Inicia la cámara y la grabación solicitando permisos al usuario.
 */
async function startVideo() {
  logDebug("Intentando iniciar la cámara...");
  
  // Verificar si getUserMedia está disponible
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    logDebug("La API getUserMedia no está disponible o requiere HTTPS.");
    alert("Tu navegador no soporta getUserMedia o requiere HTTPS.");
    return;
  }
  
  try {
    const constraints = { 
      video: { facingMode: 'environment' } // Cámara trasera
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    logDebug("Stream obtenido con éxito.");
    
    // Configurar el grabador de video
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    
    // Manejar los datos grabados
    mediaRecorder.ondataavailable = (event) => {
      recordedChunks.push(event.data);
    };

  } catch (error) {
    logDebug(`Error al acceder a la cámara: ${error.name} - ${error.message}`);
    alert(`Error al acceder a la cámara:\n${error.name}\n${error.message}`);
  }
}

/**
 * Detiene la grabación de video y guarda el archivo.
 */
function stopRecording() {
  if (isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    logDebug("Grabación detenida.");

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const videoURL = URL.createObjectURL(blob);
    
    // Crear un enlace para descargar el video grabado
    const link = document.createElement('a');
    link.href = videoURL;
    link.download = 'video_grabado_' + Date.now() + '.webm'; // Nombre del archivo
    link.click();  // Iniciar la descarga automáticamente
    logDebug("Video guardado.");
  }
}

/**
 * Carga el modelo tinyFaceDetector desde la carpeta "/models".
 */
async function loadModels() {
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  logDebug("Modelos cargados");
}

/**
 * Captura una foto mientras el video está grabando.
 */
async function capturePhoto() {
  logDebug("Intentando capturar foto...");
  const canvas = document.createElement('canvas');
  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  canvas.width = width;
  canvas.height = height;
  
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, width, height);
  
  // Estilos para visualizar la imagen capturada
  canvas.style.border = "1px solid #000";
  canvas.style.margin = "10px";
  photosDiv.appendChild(canvas);
  logDebug("Foto capturada (dataURL generada).");

  const dataURL = canvas.toDataURL('image/png');
  
  // Crear un enlace para descargar la imagen
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = 'captura_' + Date.now() + '.png';  // Nombre del archivo
  link.click();  // Iniciar la descarga automáticamente

  // Aquí podrías enviar la imagen al servidor si lo deseas (para guardarla en una base de datos o servidor).
  try {
    const response = await fetch('/save-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData: dataURL })
    });
    const result = await response.json();
    if (result.success) {
      logDebug("Foto guardada en: " + result.filePath);
    } else {
      logDebug("Error al guardar foto: " + result.error);
    }
  } catch (err) {
    logDebug("Error al enviar la foto al servidor: " + err.message);
  }
}

/**
 * Detecta rostros en el video y dispara una ráfaga de capturas si se encuentra alguno.
 */
async function detectAndCapture() {
  detectMovement();  // Llamada para detectar movimiento
  detectBody();      // Llamada para detectar cuerpos
  
  // Aquí puedes añadir más lógica si necesitas distintas acciones para diferentes tipos de detección
}

/**
 * Detecta movimiento comparando imágenes consecutivas
 */
let lastImageData = null;
function detectMovement() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  const currentImageData = context.getImageData(0, 0, canvas.width, canvas.height);
  
  if (lastImageData) {
    const diff = compareImages(lastImageData, currentImageData);
    if (diff > 1000) { // Ajusta este valor según el nivel de sensibilidad
      capturePhoto();
    }
  }
  
  lastImageData = currentImageData;
}

// Compara las imágenes para detectar movimiento
function compareImages(imageData1, imageData2) {
  const data1 = imageData1.data;
  const data2 = imageData2.data;
  let diff = 0;
  
  for (let i = 0; i < data1.length; i += 4) {
    diff += Math.abs(data1[i] - data2[i]); // Compara cada componente RGBA
  }

  return diff;
}

/**
 * Detecta cuerpos utilizando un modelo SSD (preentrenado en face-api.js).
 */
async function detectBody() {
  const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());
  logDebug("Detecciones encontradas: " + detections.length);
  
  // Si se detecta un cuerpo o movimiento, capturamos una foto
  if (detections.length > 0) {
    capturePhoto();
  }
}

/**
 * Inicializa la aplicación: carga los modelos y configura los eventos del video.
 */
async function init() {
  await loadModels();
  // No se llama a startVideo() automáticamente; el usuario debe presionar el botón.
  
  video.addEventListener('loadedmetadata', () => {
    logDebug("Metadata del video cargada. Dimensiones: " + video.videoWidth + "x" + video.videoHeight);
  });
  video.addEventListener('play', () => {
    setInterval(detectAndCapture, 500); // Llama a la detección de movimiento y cuerpo cada 500 ms
  });
}

init();
