import os
import subprocess
import sys

cert_file = "cert.pem"
key_file = "key.pem"

print("Comprobando certificados SSL...")

if not os.path.exists(cert_file) or not os.path.exists(key_file):
    print("Generando certificado SSL autofirmado...")
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        import datetime
        
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, u"localhost"),
        ])
        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.datetime.utcnow()
        ).not_valid_after(
            datetime.datetime.utcnow() + datetime.timedelta(days=365)
        ).sign(key, hashes.SHA256())

        with open(key_file, "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            ))
        with open(cert_file, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        print("✅ Certificados generados correctamente (cert.pem y key.pem).")
    except ImportError:
        print("⚠️ El paquete 'cryptography' no está instalado. Intentando usar OpenSSL...")
        try:
            subprocess.run([
                "openssl", "req", "-x509", "-newkey", "rsa:2048", "-keyout", key_file,
                "-out", cert_file, "-days", "365", "-nodes", "-subj", "/CN=localhost"
            ], check=True)
            print("✅ Certificados generados mediante OpenSSL.")
        except Exception as e:
            print(f"❌ Error al generar los certificados con OpenSSL. Instala cryptography ('pip install cryptography') o ejecuta OpenSSL manualmente. Error: {e}")
            sys.exit(1)
else:
    print("✅ Los certificados ya existen.")

print("\nPara iniciar el servidor con SSL en puerto 8081 (evita conflictos de sesión), ejecuta:")
print("python -m uvicorn server:app --reload --port 8081 --ssl-keyfile=key.pem --ssl-certfile=cert.pem")
