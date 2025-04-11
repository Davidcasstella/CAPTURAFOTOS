const video = document.getElementById('video');
const photosDiv = document.getElementById('photos');
const debugConsole = document.getElementById('debug-console');
let capturing = false;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let recordingTimeout;
let isVideoInProgress = false; // Variable para controlar si ya hay una grabación en curso
let isCapturingPhotos = false; // Variable para controlar si se están tomando fotos
let photosCaptured = 0; // Contador de fotos capturadas

// Función para imprimir logs en la consola y en la sección de la página
function logDebug(message) {
  console.log(message); // Log en consola para depuración
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

    // Intentar acceder a la cámara
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Conectar el stream de la cámara al elemento video
    video.srcObject = stream;
    logDebug("Stream obtenido con éxito.");

    // Configurar el grabador de video
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

    // Manejar los datos grabados
    mediaRecorder.ondataavailable = (event) => {
      recordedChunks.push(event.data);
    };

    mediaRecorder.onstart = () => {
      logDebug("Grabación iniciada.");
    };

    mediaRecorder.onstop = () => {
      logDebug("Grabación detenida.");
      // Detener el video después de grabar 10 segundos
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const videoURL = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = videoURL;
      link.download = 'video_grabado_' + Date.now() + '.webm'; // Nombre del archivo
      link.click();
      logDebug("Video guardado.");

      // Limpiar el buffer de grabación para la siguiente grabación
      recordedChunks = [];
    };

    // Iniciar la grabación del video
    startRecording();
  } catch (error) {
    logDebug(`Error al acceder a la cámara: ${error.name} - ${error.message}`);
    alert(`Error al acceder a la cámara:\n${error.name}\n${error.message}`);
  }
}

/**
 * Función para iniciar la grabación de video durante 10 segundos.
 */
function startRecording() {
  if (isVideoInProgress) return;  // Si ya hay una grabación en progreso, no iniciar otra

  mediaRecorder.start();  // Iniciar la grabación de video
  isRecording = true;
  isVideoInProgress = true;  // Indicar que la grabación está en progreso
  logDebug("Grabación de video iniciada...");

  // Capturar fotos mientras se graba el video
  capturePhotos();  // Iniciar el ciclo de captura de fotos

  // Detener la grabación después de 10 segundos
  recordingTimeout = setTimeout(() => {
    mediaRecorder.stop();  // Detener la grabación después de 10 segundos
    isVideoInProgress = false;  // Marcar que la grabación ha terminado
  }, 10000);  // 10,000 ms = 10 segundos
}

/**
 * Captura fotos mientras el video está grabando.
 */
async function capturePhotos() {
  const photoCount = document.getElementById('photo-count').value; // Obtener cantidad de fotos desde el slider
  photosCaptured = 0; // Reiniciar el contador de fotos cada vez que se detecta movimiento
  isCapturingPhotos = true;

  // Bucle para capturar fotos de forma continua
  const photoInterval = setInterval(() => {
    if (isCapturingPhotos) {
      capturePhoto();  // Capturar foto
      photosCaptured++;
      logDebug("Foto capturada...");
    } else {
      clearInterval(photoInterval);  // Detener el ciclo si no se está capturando fotos
      logDebug("Detenido ciclo de fotos.");
    }
  }, 1000); // Captura una foto cada 1 segundo
}

/**
 * Captura una foto del video.
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

  // Agregar el canvas al contenedor de fotos
  photosDiv.appendChild(canvas);
  logDebug("Foto capturada (dataURL generada).");

  // Convertir el canvas a una imagen para mejorar la visualización en la página
  const dataURL = canvas.toDataURL('image/png');
  
  const img = document.createElement('img');
  img.src = dataURL;  // Asignar la imagen capturada al atributo src
  img.style.maxWidth = '100%';  // Asegurarse de que la imagen se ajuste al contenedor
  img.style.border = '1px solid #000';  // Opcional: agregar borde a las fotos

  // Mostrar la foto en la página
  photosDiv.appendChild(img);
  logDebug("Foto mostrada en la página.");

  // Opcional: descargar la foto automáticamente
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = 'captura_' + Date.now() + '.png';  // Nombre del archivo
  link.click();  // Iniciar la descarga automáticamente
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

  // Log para mostrar que se está detectando movimiento
  logDebug("Detectando movimiento...");

  if (lastImageData) {
    const diff = compareImages(lastImageData, currentImageData);
    logDebug("Valor de diff: " + diff); // Imprimir el valor de diff para depuración

    if (diff > 1000) { // Ajusta este valor según el nivel de sensibilidad
      logDebug("¡Movimiento detectado! Capturando fotos...");
      capturePhotos();  // Reinicia la captura de fotos cuando se detecte movimiento
    } else {
      logDebug("No se detectó movimiento. Diff es bajo.");
    }
  } else {
    logDebug("No hay datos previos para comparar.");
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
    logDebug("Rostro detectado.");
    capturePhotos();  // Llamar a la función para capturar fotos cuando se detecta un rostro
  }
}

/**
 * Inicializa la aplicación: carga los modelos y configura los eventos del video.
 */
async function init() {
  await loadModels();
  
  video.addEventListener('loadedmetadata', () => {
    logDebug("Metadata del video cargada. Dimensiones: " + video.videoWidth + "x" + video.videoHeight);
  });
  video.addEventListener('play', () => {
    setInterval(detectMovement, 500); // Verificar el movimiento cada 500 ms
  });
}

init();
