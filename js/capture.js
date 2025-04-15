const video = document.getElementById('video');
const photosDiv = document.getElementById('photos');
const debugConsole = document.getElementById('debug-console');
const movementStatus = document.getElementById('movement-status'); // Elemento para mostrar el estado de detección
let capturing = false;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let recordingTimeout;
let isVideoInProgress = false; // Variable para controlar si ya hay una grabación en curso
let isCapturingPhotos = false; // Variable para controlar si se están tomando fotos
let photosCaptured = 0; // Contador de fotos capturadas
let detectionInterval;  // Variable para almacenar el intervalo de detección

// Función para imprimir logs en la consola y en la sección de la página
function logDebug(message) {
  console.log(message); // Log en consola para depuración
  if (debugConsole) {
    debugConsole.textContent += message + "\n";
  }
}

/**
 * Función para aplicar el zoom real de la cámara.
 * @param {number} level - Nivel de zoom (1 es normal, máximo sería 3x).
 */
async function applyCameraZoom(level) {
  const stream = video.srcObject;
  const track = stream.getTracks()[0]; // Obtener la pista de video del stream

  // Verificar si la pista tiene la capacidad de aplicar zoom
  if (track.getCapabilities().zoom) {
    const capabilities = track.getCapabilities();
    const zoom = capabilities.zoom;

    // Asegurarse de que el nivel de zoom esté dentro del rango permitido
    const newZoom = Math.min(Math.max(zoom.min, level), zoom.max);

    // Aplicar el nuevo zoom
    await track.applyConstraints({
      advanced: [{ zoom: newZoom }]
    });

    logDebug(`Zoom aplicado a: ${newZoom}`);
  } else {
    logDebug("La cámara no soporta el ajuste de zoom.");
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
      video: { facingMode: 'environment' }, // Cámara trasera
      audio: true  // Solicitar también acceso al micrófono
    };

    // Intentar acceder a la cámara y al micrófono
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Conectar el stream de la cámara al elemento video
    video.srcObject = stream;
    logDebug("Stream obtenido con éxito.");

    // Aplicar zoom de 3x al video real (cámara)
    await applyCameraZoom(3);

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

  // Iniciar la detección de movimiento cada 1000 ms
  detectionInterval = setInterval(detectPerson, 1000); // Verificar la detección cada segundo
}

/**
 * Detecta personas usando el modelo COCO-SSD de TensorFlow.js
 */
async function detectPerson() {
  const model = await cocoSsd.load();  // Cargar el modelo COCO-SSD

  const predictions = await model.detect(video);

  // Filtrar las detecciones que corresponden a una persona
  const personDetections = predictions.filter(prediction => prediction.class === 'person');

  if (personDetections.length > 0) {
    logDebug("Persona detectada. Capturando fotos...");
    movementStatus.textContent = "¡Persona detectada!";
    capturePhotos();  // Captura las fotos solo cuando se detecta una persona
  } else {
    logDebug("No se detectaron personas.");
    movementStatus.textContent = "No se detectaron personas.";
    stopCapturingPhotos(); // Detener las capturas de fotos si no se detecta una persona
  }
}

/**
 * Captura fotos mientras el video está grabando.
 */
async function capturePhotos() {
  const photoCount = document.getElementById('photo-count').value; // Obtener cantidad de fotos desde el slider
  photosCaptured = 0; // Reiniciar el contador de fotos cada vez que se detecta una persona
  isCapturingPhotos = true;

  // Bucle para capturar fotos de forma continua, pero con más tiempo entre cada captura
  const photoInterval = setInterval(() => {
    if (isCapturingPhotos && photosCaptured < photoCount) {
      capturePhoto();  // Capturar foto
      photosCaptured++;
      logDebug("Foto capturada...");
    } else {
      clearInterval(photoInterval);  // Detener el ciclo si no se está capturando fotos o si ya se alcanzó el número de fotos
      logDebug("Detenido ciclo de fotos.");
    }
  }, 1000); // Captura una foto cada 1 segundo
}

/**
 * Detiene la captura de fotos cuando no hay movimiento.
 */
function stopCapturingPhotos() {
  isCapturingPhotos = false;
  logDebug("Captura de fotos detenida.");
}

/**
 * Captura una foto del video.
 */
async function capturePhoto() {
  logDebug("Intentando capturar foto...");
  
  // Crear un canvas para dibujar el contenido del video
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

  // Crear un enlace para descargar la foto
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = 'captura_' + Date.now() + '.png';  // Nombre del archivo
  link.click();  // Iniciar la descarga automáticamente
}

/**
 * Función para detener todos los procesos: grabación, detección, fotos, etc.
 */
function stopAllProcesses() {
  // Detener la grabación
  if (isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    logDebug("Grabación detenida.");
  }

  // Detener la detección de personas
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
    logDebug("Detección de personas detenida.");
  }

  // Detener la captura de fotos
  stopCapturingPhotos();

  // Detener el zoom
  applyZoomToVideo(1);  // Restaurar el zoom a 1x
  logDebug("Todos los procesos detenidos.");
}

/**
 * Inicializa la aplicación: carga los modelos y configura los eventos del video.
 */
async function init() {
  await loadModels();
  
  // Aplicar el zoom inicial a 3x cuando se inicia la cámara
  await applyCameraZoom(3);

  video.addEventListener('loadedmetadata', () => {
    logDebug("Metadata del video cargada. Dimensiones: " + video.videoWidth + "x" + video.videoHeight);
  });
  video.addEventListener('play', () => {
    setInterval(detectPerson, 1000); // Verificar la detección cada 1 segundo
  });
}

init();
