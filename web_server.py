#!/usr/bin/env python3
"""
Servidor web simple para servir la aplicación de detección de personas
Uso: python web_server.py
"""
import http.server
import socketserver
import os
import webbrowser
from threading import Timer

PORT = 8080
DIRECTORY = "."

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Agregar headers CORS para desarrollo
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

def open_browser():
    """Abrir el navegador automáticamente"""
    webbrowser.open(f'http://localhost:{PORT}')

if __name__ == "__main__":
    # Verificar que index.html existe
    if not os.path.exists('index.html'):
        print("❌ Error: No se encontró index.html en el directorio actual")
        print("📁 Directorio actual:", os.getcwd())
        print("📄 Archivos disponibles:")
        for file in os.listdir('.'):
            print(f"   - {file}")
        exit(1)
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("🌐 Servidor Web Iniciado")
        print("=" * 40)
        print(f"📂 Sirviendo archivos desde: {os.path.abspath(DIRECTORY)}")
        print(f"🔗 URL: http://localhost:{PORT}")
        print(f"📄 Página principal: http://localhost:{PORT}/index.html")
        print("=" * 40)
        print("💡 Recuerda también iniciar el servidor Flask en el puerto 5000")
        print("   python server.py")
        print("=" * 40)
        print("Presiona Ctrl+C para detener el servidor")
        
        # Abrir navegador automáticamente después de 2 segundos
        Timer(2, open_browser).start()
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Servidor web detenido")
            httpd.shutdown()