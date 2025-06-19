from flask import Flask, request, jsonify, send_from_directory, render_template_string
from flask_cors import CORS
import base64
import os
from datetime import datetime
import uuid
import json

app = Flask(__name__)
CORS(app, origins=["*"])  # Permitir todos los orígenes para desarrollo

# Crear carpeta de fotos si no existe
PHOTOS_DIR = 'captured_photos'
if not os.path.exists(PHOTOS_DIR):
    os.makedirs(PHOTOS_DIR)
    print(f"✅ Creada carpeta: {PHOTOS_DIR}")

@app.route('/', methods=['GET'])
def serve_index():
    """Servir el archivo index.html"""
    try:
        # Intentar servir el archivo index.html desde el directorio actual
        return send_from_directory('.', 'index.html')
    except FileNotFoundError:
        return jsonify({
            'error': 'index.html no encontrado',
            'message': 'Asegúrate de que index.html esté en el mismo directorio que server.py',
            'endpoints_api': {
                'health': '/health',
                'save_photo': '/save-photo (POST)',
                'get_photos': '/get-photos',
                'delete_photo': '/delete-photo/<filename> (DELETE)',
                'view_photo': '/photo/<filename>'
            }
        }), 404

@app.route('/api', methods=['GET'])
def api_info():
    """Información de la API"""
    return jsonify({
        'message': 'Servidor de Captura de Fotos funcionando correctamente',
        'status': 'active',
        'endpoints': {
            'health': '/health',
            'save_photo': '/save-photo (POST)',
            'get_photos': '/get-photos',
            'delete_photo': '/delete-photo/<filename> (DELETE)',
            'view_photo': '/photo/<filename>'
        }
    })

# Servir archivos estáticos (CSS, JS, etc.)
@app.route('/<path:filename>')
def serve_static(filename):
    """Servir archivos estáticos como CSS, JS, imágenes"""
    try:
        return send_from_directory('.', filename)
    except FileNotFoundError:
        return jsonify({'error': f'Archivo {filename} no encontrado'}), 404

@app.route('/save-photo', methods=['POST', 'OPTIONS'])
def save_photo():
    """Guardar foto enviada desde el frontend"""
    if request.method == 'OPTIONS':
        # Manejar preflight request de CORS
        return '', 200
    
    try:
        # Verificar que se recibieron datos JSON
        if not request.json:
            return jsonify({'error': 'No JSON data received'}), 400
            
        data = request.json
        print(f"📥 Datos recibidos: {list(data.keys())}")
        
        # Obtener datos de la imagen
        image_data = data.get('image')
        reason = data.get('reason', 'Unknown')
        timestamp = data.get('timestamp', datetime.now().isoformat())
        
        if not image_data:
            return jsonify({'error': 'No image data provided'}), 400
        
        # Verificar formato de imagen base64
        if not image_data.startswith('data:image/'):
            return jsonify({'error': 'Invalid image format'}), 400
        
        # Remover el prefijo data:image/png;base64,
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        else:
            return jsonify({'error': 'Invalid base64 format'}), 400
        
        try:
            # Decodificar base64
            image_bytes = base64.b64decode(image_data)
        except Exception as decode_error:
            return jsonify({'error': f'Base64 decode error: {str(decode_error)}'}), 400
        
        # Generar nombre único para el archivo
        unique_id = str(uuid.uuid4())[:8]
        safe_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_reason = ''.join(c for c in reason if c.isalnum() or c in (' ', '-', '_')).replace(' ', '_')
        
        filename = f"{safe_timestamp}_{safe_reason}_{unique_id}.png"
        filepath = os.path.join(PHOTOS_DIR, filename)
        
        # Guardar archivo
        with open(filepath, 'wb') as f:
            f.write(image_bytes)
        
        file_size = os.path.getsize(filepath)
        
        print(f"✅ Foto guardada: {filename} ({file_size} bytes)")
        
        return jsonify({
            'success': True,
            'filename': filename,
            'filepath': filepath,
            'size': file_size,
            'message': 'Photo saved successfully'
        })
        
    except Exception as e:
        print(f"❌ Error guardando foto: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/get-photos', methods=['GET'])
def get_photos():
    """Obtener lista de todas las fotos guardadas"""
    try:
        photos = []
        
        if not os.path.exists(PHOTOS_DIR):
            return jsonify({
                'success': True,
                'photos': [],
                'total': 0,
                'message': 'No photos directory found'
            })
        
        for filename in os.listdir(PHOTOS_DIR):
            if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                filepath = os.path.join(PHOTOS_DIR, filename)
                try:
                    stat = os.stat(filepath)
                    photos.append({
                        'filename': filename,
                        'filepath': filepath,
                        'size': stat.st_size,
                        'created': datetime.fromtimestamp(stat.st_ctime).isoformat(),
                        'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        'url': f'/photo/{filename}'
                    })
                except OSError:
                    continue
        
        # Ordenar por fecha de creación (más reciente primero)
        photos.sort(key=lambda x: x['created'], reverse=True)
        
        print(f"📋 Enviando lista de {len(photos)} fotos")
        
        return jsonify({
            'success': True,
            'photos': photos,
            'total': len(photos)
        })
        
    except Exception as e:
        print(f"❌ Error obteniendo fotos: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/photo/<filename>', methods=['GET'])
def view_photo(filename):
    """Servir una foto específica"""
    try:
        return send_from_directory(PHOTOS_DIR, filename)
    except FileNotFoundError:
        return jsonify({'error': 'Photo not found'}), 404

@app.route('/delete-photo/<filename>', methods=['DELETE'])
def delete_photo(filename):
    """Eliminar una foto específica"""
    try:
        filepath = os.path.join(PHOTOS_DIR, filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Photo not found'}), 404
        
        # Verificar que es un archivo de imagen
        if not filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            return jsonify({'error': 'Invalid file type'}), 400
        
        os.remove(filepath)
        print(f"🗑️ Foto eliminada: {filename}")
        
        return jsonify({
            'success': True,
            'message': f'Photo {filename} deleted successfully'
        })
        
    except Exception as e:
        print(f"❌ Error eliminando foto: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/clear-all-photos', methods=['DELETE'])
def clear_all_photos():
    """Eliminar todas las fotos"""
    try:
        deleted_count = 0
        
        if os.path.exists(PHOTOS_DIR):
            for filename in os.listdir(PHOTOS_DIR):
                if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                    filepath = os.path.join(PHOTOS_DIR, filename)
                    try:
                        os.remove(filepath)
                        deleted_count += 1
                    except OSError:
                        continue
        
        print(f"🗑️ Eliminadas {deleted_count} fotos")
        
        return jsonify({
            'success': True,
            'deleted_count': deleted_count,
            'message': f'Deleted {deleted_count} photos'
        })
        
    except Exception as e:
        print(f"❌ Error eliminando todas las fotos: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Verificar estado del servidor"""
    try:
        photo_count = 0
        total_size = 0
        
        if os.path.exists(PHOTOS_DIR):
            for filename in os.listdir(PHOTOS_DIR):
                if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                    photo_count += 1
                    filepath = os.path.join(PHOTOS_DIR, filename)
                    try:
                        total_size += os.path.getsize(filepath)
                    except OSError:
                        continue
        
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'photos_directory': os.path.abspath(PHOTOS_DIR),
            'photos_count': photo_count,
            'total_size_bytes': total_size,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'server_info': {
                'host': '0.0.0.0',
                'port': 5000,
                'debug': True
            }
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

# Manejo de errores
@app.errorhandler(404)
def not_found_error(error):
    return jsonify({
        'error': 'Endpoint not found',
        'available_endpoints': {
            'GET /': 'Serve index.html',
            'GET /health': 'Health check',
            'POST /save-photo': 'Save photo',
            'GET /get-photos': 'List photos',
            'GET /photo/<filename>': 'View photo',
            'DELETE /delete-photo/<filename>': 'Delete photo',
            'DELETE /clear-all-photos': 'Delete all photos'
        }
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'error': 'Internal server error',
        'message': str(error)
    }), 500

# Middleware para logging
@app.before_request
def log_request_info():
    if request.endpoint != 'health_check':  # No logear health checks
        print(f"🌐 {request.method} {request.url} - {request.remote_addr}")

@app.after_request
def after_request(response):
    # Agregar headers CORS adicionales
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    print("🚀 Iniciando Servidor de Captura de Fotos")
    print(f"📁 Directorio de fotos: {os.path.abspath(PHOTOS_DIR)}")
    print("🌐 Servidor disponible en:")
    print("   - http://localhost:5000")
    print("   - http://127.0.0.1:5000")
    print("   - http://0.0.0.0:5000")
    print("\n📋 Endpoints disponibles:")
    print("   GET  / - Servir index.html")
    print("   GET  /health - Estado del servidor")
    print("   POST /save-photo - Guardar foto")
    print("   GET  /get-photos - Listar fotos")
    print("   GET  /photo/<filename> - Ver foto")
    print("   DELETE /delete-photo/<filename> - Eliminar foto")
    print("   DELETE /clear-all-photos - Eliminar todas las fotos")
    print("\n⚡ Presiona Ctrl+C para detener el servidor")
    print("-" * 50)
    
    try:
        app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)
    except KeyboardInterrupt:
        print("\n👋 Servidor detenido por el usuario")
    except Exception as e:
        print(f"\n❌ Error iniciando servidor: {e}")