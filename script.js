// Referencias a elementos del DOM
const video = document.getElementById('video');
const canvas = document.getElementById('canvas-display');
const ctx = canvas.getContext('2d');
const photosDiv = document.getElementById('photos');
const debugConsole = document.getElementById('debug-console');
const movementStatus = document.getElementById('movement-status');
const zoomInfo = document.getElementById('zoom-info');
const photoCountSlider = document.getElementById('photo-count');
const photoCountValue = document.getElementById('photo-count-value');
const zoomLevelSlider = document.getElementById('zoom-level');
const zoomLevelValue = document.getElementById('zoom-level-value');

// Variables de control
let isRecording = false;
let isCapturingPhotos = false;
let detectionInterval;
let renderInterval;
let cocoModel;
let currentZoom = 1;
let targetZoom = 1;
let zoomTransitionSpeed = 0.1;
let personDetectedTime = 0;
let lastDetectionTime = 0;
let zoomResetTimeout;

// Configuración
const ZOOM_DURATION = 10000; // 10 segundos en zoom normal después de detectar persona
const DETECTION_INTERVAL = 1000; // Verificar detección cada segundo
const RENDER_FPS = 30; // FPS para renderizado del canvas

// Event listeners para sliders
photoCountSlider.addEventListener('input', () => {
  photoCountValue.textContent = photoCountSlider.value;
});

zoomLevelSlider.addEventListener('input', () => {
  zoomLevelValue.textContent = zoomLevelSlider.value + 'x';
});

// Clase para manejar el zoom por capas
class ZoomManager {
  constructor(videoElement, canvasElement, contextElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = contextElement;
    this.currentZoom = 1;
    this.targetZoom = 1;
    this.transitionSpeed = 0.1;
  }

  setTargetZoom(zoom) {
    this.targetZoom = zoom;
    logDebug(`Zoom objetivo establecido: ${zoom}x`);
  }

  updateZoom() {
    if (Math.abs(this.currentZoom - this.targetZoom) > 0.01) {
      const difference = this.targetZoom - this.currentZoom;
      this.currentZoom += difference * this.transitionSpeed;
      
      if (Math.abs(difference) < 0.01) {
        this.currentZoom = this.targetZoom;
      }
      
      this.updateZoomInfo();
    }
  }

  updateZoomInfo() {
    zoomInfo.textContent = `Zoom: ${this.currentZoom.toFixed(1)}x`;
  }

  renderFrame() {
    if (!this.video.videoWidth || !this.video.videoHeight || this.video.paused || this.video.ended) {
      return;
    }

    // Configurar el tamaño del canvas
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;

    if (this.canvas.width === 0 || this.canvas.height === 0) {
      return;
    }

    // Calcular dimensiones para el zoom
    const videoAspect = this.video.videoWidth / this.video.videoHeight;
    const canvasAspect = this.canvas.width / this.canvas.height;

    let drawWidth, drawHeight;
    let sourceX, sourceY, sourceWidth, sourceHeight;

    // Calcular área de origen en el video (para el zoom)
    sourceWidth = this.video.videoWidth / this.currentZoom;
    sourceHeight = this.video.videoHeight / this.currentZoom;
    sourceX = (this.video.videoWidth - sourceWidth) / 2;
    sourceY = (this.video.videoHeight - sourceHeight) / 2;

    // Calcular tamaño de destino en el canvas manteniendo aspecto
    if (videoAspect > canvasAspect) {
      drawHeight = this.canvas.height;
      drawWidth = drawHeight * videoAspect;
    } else {
      drawWidth = this.canvas.width;
      drawHeight = drawWidth / videoAspect;
    }

    const drawX = (this.canvas.width - drawWidth) / 2;
    const drawY = (this.canvas.height - drawHeight) / 2;

    // Limpiar canvas con fondo negro
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    try {
      // Dibujar el video con zoom
      this.ctx.drawImage(
        this.video,
        sourceX, sourceY, sourceWidth, sourceHeight,
        drawX, drawY, drawWidth, drawHeight
      );
    } catch (error) {
      // Silenciar errores temporales de renderizado
    }
  }

  captureCurrentFrame() {
    // Crear un canvas temporal para la captura
    const captureCanvas = document.createElement('canvas');
    const captureCtx = captureCanvas.getContext('2d');
    
    // Usar resolución del video original
    captureCanvas.width = this.video.videoWidth;
    captureCanvas.height = this.video.videoHeight;

    // Capturar con el zoom actual
    const sourceWidth = this.video.videoWidth / this.currentZoom;
    const sourceHeight = this.video.videoHeight / this.currentZoom;
    const sourceX = (this.video.videoWidth - sourceWidth) / 2;
    const sourceY = (this.video.videoHeight - sourceHeight) / 2;

    captureCtx.drawImage(
      this.video,
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, captureCanvas.width, captureCanvas.height
    );

    return captureCanvas.toDataURL('image/png');
  }
}

// Instanciar el manejador de zoom
const zoomManager = new ZoomManager(video, canvas, ctx);

// Clase para manejar la detección de personas
class PersonDetector {
  constructor() {
    this.model = null;
    this.isLoaded = false;
  }

  async loadModel() {
    try {
      logDebug("Cargando modelo COCO-SSD...");
      // Verificar que cocoSsd esté disponible
      if (typeof cocoSsd === 'undefined') {
        throw new Error('COCO-SSD no está cargado. Verifica las rutas de los scripts.');
      }
      this.model = await cocoSsd.load();
      this.isLoaded = true;
      logDebug("Modelo COCO-SSD cargado exitosamente");
    } catch (error) {
      logDebug(`Error cargando modelo: ${error.message}`);
      this.isLoaded = false;
    }
  }

  async detectPerson() {
    if (!this.isLoaded || !this.model) return false;

    try {
      const predictions = await this.model.detect(video);
      const personDetections = predictions.filter(p => p.class === 'person' && p.score > 0.5);
      return personDetections.length > 0;
    } catch (error) {
      logDebug(`Error en detección: ${error.message}`);
      return false;
    }
  }
}

// Instanciar el detector de personas
const personDetector = new PersonDetector();

// Clase para manejar las capturas de fotos
class PhotoCapture {
  constructor() {
    this.isCapturing = false;
    this.photoCount = 0;
    this.maxPhotos = 3;
  }

  async startCapturing() {
    if (this.isCapturing) return;
    
    this.isCapturing = true;
    this.photoCount = 0;
    this.maxPhotos = parseInt(photoCountSlider.value);
    
    logDebug(`Iniciando captura de ${this.maxPhotos} fotos...`);

    const captureInterval = setInterval(() => {
      if (this.photoCount < this.maxPhotos && this.isCapturing) {
        this.capturePhoto();
        this.photoCount++;
      } else {
        clearInterval(captureInterval);
        this.isCapturing = false;
        logDebug("Captura de fotos completada");
      }
    }, 800); // Una foto cada 800ms
  }

  stopCapturing() {
    this.isCapturing = false;
    logDebug("Captura de fotos detenida");
  }

  capturePhoto() {
    try {
      const dataURL = zoomManager.captureCurrentFrame();
      
      // Crear elemento de imagen
      const img = document.createElement('img');
      img.src = dataURL;
      img.className = 'captured-photo';
      img.alt = 'Foto capturada';
      
      // Agregar timestamp
      const timestamp = new Date().toLocaleTimeString();
      const caption = document.createElement('div');
      caption.textContent = `Capturada: ${timestamp}`;
      caption.style.fontSize = '12px';
      caption.style.textAlign = 'center';
      caption.style.marginBottom = '10px';
      
      const container = document.createElement('div');
      container.appendChild(img);
      container.appendChild(caption);
      
      photosDiv.insertBefore(container, photosDiv.firstChild);
      
      // Descargar automáticamente
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = `captura_${Date.now()}.png`;
      link.click();
      
      logDebug(`Foto capturada (${this.photoCount + 1}/${this.maxPhotos})`);
    } catch (error) {
      logDebug(`Error capturando foto: ${error.message}`);
    }
  }
}

// Instanciar el capturador de fotos
const photoCapture = new PhotoCapture();

// Funciones principales
function logDebug(message) {
  console.log(message);
  const timestamp = new Date().toLocaleTimeString();
  if (debugConsole) {
    debugConsole.textContent += `[${timestamp}] ${message}\n`;
    debugConsole.scrollTop = debugConsole.scrollHeight;
  }
}

async function startVideo() {
  logDebug("Solicitando permisos de cámara...");
  
  // Verificar si getUserMedia está disponible
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    logDebug("Error: getUserMedia no está disponible. Necesitas HTTPS o localhost.");
    alert("Error: Tu navegador no soporta getUserMedia o necesitas usar HTTPS/localhost.");
    return;
  }
  
  try {
    // Primero intentar con cámara trasera
    let constraints = {
      video: { 
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 }
      },
      audio: false
    };

    logDebug("Intentando acceder a cámara trasera...");
    let stream;
    
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      logDebug("Cámara trasera no disponible, intentando cámara frontal...");
      // Si falla, intentar con cualquier cámara
      constraints = {
        video: { 
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 }
        },
        audio: false
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    }

    video.srcObject = stream;
    logDebug("Stream de cámara asignado al video");
    
    // Esperar a que el video esté listo
    video.onloadedmetadata = () => {
      logDebug(`Video cargado: ${video.videoWidth}x${video.videoHeight}`);
      video.play().then(() => {
        logDebug("Video reproduciendo");
        startDetectionAndRendering();
      }).catch(err => {
        logDebug(`Error reproduciendo video: ${err.message}`);
      });
    };

    video.onerror = (error) => {
      logDebug(`Error en el video: ${error}`);
    };

    updateMovementStatus("Cámara iniciada", "status-waiting");
    
  } catch (error) {
    logDebug(`Error accediendo a la cámara: ${error.name} - ${error.message}`);
    
    let errorMessage = "Error accediendo a la cámara:\n";
    if (error.name === 'NotAllowedError') {
      errorMessage += "Permisos de cámara denegados. Por favor, permite el acceso a la cámara.";
    } else if (error.name === 'NotFoundError') {
      errorMessage += "No se encontró ninguna cámara en el dispositivo.";
    } else if (error.name === 'NotReadableError') {
      errorMessage += "La cámara está siendo usada por otra aplicación.";
    } else {
      errorMessage += error.message;
    }
    
    alert(errorMessage);
    updateMovementStatus("Error al acceder a la cámara", "status-no-person");
  }
}

async function startDetectionAndRendering() {
  logDebug("Iniciando detección y renderizado...");
  
  // Cargar modelo si no está cargado
  if (!personDetector.isLoaded) {
    await personDetector.loadModel();
    if (!personDetector.isLoaded) {
      logDebug("No se pudo cargar el modelo de detección. Continuando solo con zoom manual.");
      updateMovementStatus("Modelo no cargado - Solo zoom manual", "status-no-person");
    }
  }

  // Iniciar zoom inicial
  const initialZoom = parseInt(zoomLevelSlider.value);
  zoomManager.setTargetZoom(initialZoom);
  logDebug(`Zoom inicial establecido: ${initialZoom}x`);
  
  // Iniciar renderizado del canvas
  if (renderInterval) {
    clearInterval(renderInterval);
  }
  
  renderInterval = setInterval(() => {
    zoomManager.updateZoom();
    zoomManager.renderFrame();
  }, 1000 / RENDER_FPS);

  // Iniciar detección solo si el modelo está cargado
  if (personDetector.isLoaded) {
    if (detectionInterval) {
      clearInterval(detectionInterval);
    }
    
    detectionInterval = setInterval(async () => {
      const personDetected = await personDetector.detectPerson();
      handlePersonDetection(personDetected);
    }, DETECTION_INTERVAL);
    
    updateMovementStatus("Buscando personas...", "status-waiting");
  }

  logDebug("Sistema iniciado correctamente");
}

function handlePersonDetection(detected) {
  const currentTime = Date.now();
  
  if (detected) {
    lastDetectionTime = currentTime;
    
    if (currentZoom > 1.5) { // Si está en zoom, cambiar a normal
      zoomManager.setTargetZoom(1);
      updateMovementStatus("¡Persona detectada! Zoom normal activado", "status-detected");
      
      // Iniciar captura de fotos
      photoCapture.startCapturing();
      
      // Programar regreso al zoom después de 10 segundos
      clearTimeout(zoomResetTimeout);
      zoomResetTimeout = setTimeout(() => {
        const timeSinceLastDetection = Date.now() - lastDetectionTime;
        if (timeSinceLastDetection >= ZOOM_DURATION) {
          const zoomLevel = parseInt(zoomLevelSlider.value);
          zoomManager.setTargetZoom(zoomLevel);
          updateMovementStatus("Regresando a zoom de búsqueda", "status-waiting");
          logDebug("Regresando al zoom de búsqueda");
        }
      }, ZOOM_DURATION);
    }
    
    logDebug("Persona detectada");
  } else {
    // Si han pasado más de 15 segundos sin detección, regresar al zoom
    if (currentTime - lastDetectionTime > ZOOM_DURATION + 5000 && currentZoom < 2) {
      const zoomLevel = parseInt(zoomLevelSlider.value);
      zoomManager.setTargetZoom(zoomLevel);
      updateMovementStatus("Buscando personas...", "status-waiting");
      photoCapture.stopCapturing();
    } else if (currentZoom < 2) {
      updateMovementStatus("No se detectaron personas", "status-no-person");
    }
  }
}

function updateMovementStatus(message, className) {
  movementStatus.textContent = message;
  movementStatus.className = className;
}

async function capturePhoto() {
  photoCapture.capturePhoto();
}

function testZoom() {
  const currentTarget = zoomManager.targetZoom;
  if (currentTarget <= 1.5) {
    const zoomLevel = parseInt(zoomLevelSlider.value);
    zoomManager.setTargetZoom(zoomLevel);
    logDebug("Probando zoom de búsqueda");
  } else {
    zoomManager.setTargetZoom(1);
    logDebug("Probando zoom normal");
  }
}

function stopAllProcesses() {
  logDebug("Deteniendo todos los procesos...");
  
  // Detener intervalos
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  
  if (renderInterval) {
    clearInterval(renderInterval);
    renderInterval = null;
  }
  
  if (zoomResetTimeout) {
    clearTimeout(zoomResetTimeout);
    zoomResetTimeout = null;
  }
  
  // Detener captura
  photoCapture.stopCapturing();
  
  // Detener cámara
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  
  // Limpiar canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Resetear zoom
  zoomManager.currentZoom = 1;
  zoomManager.targetZoom = 1;
  zoomManager.updateZoomInfo();
  
  updateMovementStatus("Procesos detenidos", "status-waiting");
  logDebug("Todos los procesos detenidos");
}

// Inicializar la aplicación
window.addEventListener('load', () => {
  logDebug("Aplicación iniciada");
  
  // Verificar disponibilidad de APIs
  if (!navigator.mediaDevices) {
    logDebug("ADVERTENCIA: MediaDevices no disponible. Necesitas HTTPS o localhost.");
    updateMovementStatus("Error: Necesitas HTTPS o localhost", "status-no-person");
    return;
  }
  
  // Verificar carga de TensorFlow
  if (typeof tf === 'undefined') {
    logDebug("ADVERTENCIA: TensorFlow.js no está cargado");
    updateMovementStatus("Error: TensorFlow no cargado", "status-no-person");
    return;
  }
  
  if (typeof cocoSsd === 'undefined') {
    logDebug("ADVERTENCIA: COCO-SSD no está cargado");
    updateMovementStatus("Error: COCO-SSD no cargado", "status-no-person");
    return;
  }
  
  logDebug("Todas las dependencias cargadas correctamente");
  updateMovementStatus("Presiona 'Iniciar Cámara' para comenzar", "status-waiting");
});