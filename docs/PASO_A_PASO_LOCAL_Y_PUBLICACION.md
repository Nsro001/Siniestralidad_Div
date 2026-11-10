# Guía: probar localmente y publicar Administración de Cartera

Esta guía usa el **proyecto Supabase actual**, por indicación del usuario: sus datos vigentes son de prueba. La aplicación se ejecutará primero en el computador, conectada a esa misma base, Auth y Storage. No necesitas crear otro proyecto. Esta guía no ejecuta instalaciones, migraciones ni despliegues automáticamente.

Arquitectura final: GitHub guarda el código; Vercel sirve React; Render ejecuta Node con Poppler/Tesseract; Supabase guarda usuarios, datos y archivos privados.

## 1. Preparar el computador

En una terminal:

```bash
cd /home/naro1/Documentos/Siniestralidad
node --version
npm --version
git --version
```

Usar Node 22 o superior; la imagen Docker incluida usa Node 24. Si falta Node o es anterior a 22, actualizarlo antes de instalar dependencias.

En este equipo Linux basado en Debian, instalar herramientas PDF/OCR:

```bash
sudo apt-get update
sudo apt-get install -y poppler-utils tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng
pdftotext -v
pdfinfo -v
pdftoppm -v
tesseract --list-langs
```

La lista de idiomas debe incluir `spa` y `eng`.

Instalar dependencias desde la raíz del repositorio:

```bash
npm ci --prefix backend
npm ci --prefix frontend
```

## 2. Preparar el Supabase actual

Selecciona el proyecto actual en Supabase. Primero consulta en SQL Editor:

```sql
select to_regclass('public.clients') as clientes,
       to_regclass('public.portfolio_policies') as polizas,
       to_regclass('public.report_branding') as marca;
```

Si ya están las seis migraciones históricas y `polizas` es null, aplicar una vez el archivo completo `supabase/ADMINISTRACION_CARTERA_COMPLETO.sql`. Si el módulo ya está instalado, no repetirlo. No aplicar además sus tres migraciones nuevas individuales.

Las seis migraciones históricas, en orden, son `202609060001_accounts.sql`, `202609170001_portfolio.sql`, `202609230001_replace_dataset.sql`, `202609290001_chunked_dataset_upload.sql`, `202610010001_report_branding.sql` y `202610160001_presentation_branding.sql`. Son necesarias antes del consolidado; aplicar únicamente las que realmente falten, sin recrear tablas existentes. Ante un error, detenerse y revisar su mensaje completo.

Comprobar después:

```sql
select to_regclass('public.portfolio_policy_versions') as versiones;
select id, public from storage.buckets where id='portfolio-policies';
```

`versiones` debe existir y el bucket debe mostrar `public=false`.

## 3. Usar el administrador actual

Si ya tienes una cuenta administradora, úsala y pasa al siguiente paso. Para crearla si falta: en Authentication → Users, crear una cuenta con correo y contraseña de al menos 12 caracteres. Confirmar la cuenta desde el panel si es necesario. Copiar su UUID.

Ejecutar, sustituyendo el marcador por el UUID real:

```sql
update public.profiles
set role = 'admin', full_name = 'Administrador de pruebas', active = true
where id = 'UUID_REAL_DEL_USUARIO';

select id, email, role, active
from public.profiles
where id = 'UUID_REAL_DEL_USUARIO';
```

Comprobar `role = admin` y `active = true`. Mantener habilitado el inicio de sesión por email/contraseña; desactivar registro público y acceso anónimo para el esquema de usuarios administrados de esta aplicación.

## 4. Configurar archivos locales

Ya existen archivos locales de configuración. Editarlos conservando una copia privada de sus valores anteriores; no sobrescribirlos con `cp` sin revisar.

`backend/.env`:

```env
SUPABASE_URL=URL_DEL_PROYECTO_ACTUAL
SUPABASE_PUBLISHABLE_KEY=CLAVE_PUBLICA_DEL_PROYECTO_ACTUAL
SUPABASE_SECRET_KEY=CLAVE_SECRETA_DEL_PROYECTO_ACTUAL
FRONTEND_ORIGIN=http://localhost:5173
PORT=4000
PORTFOLIO_ADMIN_ENABLED=true
```

`frontend/.env.local`:

```env
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=URL_DEL_PROYECTO_ACTUAL
VITE_SUPABASE_PUBLISHABLE_KEY=CLAVE_PUBLICA_DEL_PROYECTO_ACTUAL
VITE_PORTFOLIO_ADMIN_ENABLED=true
```

Sustituir todos los marcadores. Ambos archivos deben apuntar al mismo Supabase actual. La clave secreta va exclusivamente en el backend. Reiniciar los procesos cuando cambien estas variables.

## 5. Ejecutar localmente

Terminal 1:

```bash
cd /home/naro1/Documentos/Siniestralidad/backend
npm run dev
```

Abrir `http://localhost:4000/health`; debe devolver `{"status":"ok"}`. Esto comprueba el proceso HTTP; el acceso a datos se comprueba al entrar a la aplicación.

Terminal 2:

```bash
cd /home/naro1/Documentos/Siniestralidad/frontend
npm run dev
```

Abrir `http://localhost:5173` e iniciar sesión con el administrador actual. Dejar abiertas ambas terminales. Si Vite cambia de puerto porque 5173 está ocupado, revisar el proceso existente y la configuración de origen antes de continuar.

## 6. Verificar el módulo

Con datos y documentos de prueba:

- Crear un cliente con un RUT válido; editar contacto y razón social.
- Añadir dos pólizas de diferentes aseguradoras y guardar borradores.
- Añadir varias coberturas, planes, grupos y condiciones documentadas.
- Cargar un PDF digital y uno escaneado; extraer y revisar páginas, datos y citas.
- Para un documento mixto, probar la opción de OCR también en páginas con texto digital.
- Completar evidencia y validar una póliza. Para versión inicial/renovación, su fecha de efecto coincide con el inicio de vigencia.
- Comprobar en Inicio la vigencia, todas las fechas, filtros y ambos sentidos del ordenamiento.
- Probar una renovación futura y confirmar que conserva la póliza vigente actual.
- Si se usan sábanas de prueba, revisar primas, gastos y reportes históricos. Registrar vínculos y cobros sin duplicar las primas de sábana.
- Crear un ejecutivo, asignarle ese cliente y comprobar desde otra sesión que solo puede consultar su cartera.

Desde una tercera terminal, en la raíz del proyecto:

```bash
npm test --prefix backend
npm run build --prefix backend
./frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json
npm run build --prefix frontend
```

Si la suite en tu entorno agrupa los errores por archivo, ejecutar desde `backend`:

```bash
node --import tsx --test --test-isolation=none tests/*.test.ts
```

Prueba adicional de Poppler/Tesseract reales, desde `backend`:

```bash
node --import tsx tests/pdf-local-smoke.mjs
```

No continuar a publicación si hay fallos relevantes. El build de Vite puede informar el aviso de tamaño del bundle aun terminando correctamente.

## 7. Subir la rama a GitHub

Antes del push, revisar en Render/Vercel qué ramas despliegan automáticamente. La rama de trabajo actual es `feature/noergon-redesign`; confirmar que no dispara directamente producción. Pausar los despliegues de producción si están vinculados a esa rama mientras se prepara la configuración.

Desde la raíz:

```bash
git status
git branch --show-current
git check-ignore backend/.env frontend/.env.local
git add -A
git diff --cached --name-only
```

`git check-ignore` debe indicar que ambos archivos `.env` están ignorados. Revisar la lista preparada: no debe contener claves, `.env` privados ni documentos de clientes.

Después:

```bash
git commit -m "Incorpora administración de cartera y extracción local de pólizas"
git push -u origin HEAD
```

Si GitHub solicita autenticación, usar el método configurado en el equipo (SSH o token/gestor de credenciales para HTTPS). No pegar tokens en el repositorio ni por chat.

Conservar la rama hasta terminar de configurar el despliegue. El push solo publica el código de esa rama; los despliegues automáticos dependen de la rama configurada en cada servicio.

## 8. Confirmar Supabase antes de publicar

Local y despliegue usarán el mismo proyecto actual, cuyos datos son de prueba. Si ya aplicaste el SQL en el paso 2, no lo repitas. Mantén sus usuarios, asignaciones y datos; conserva un respaldo antes de modificar el esquema.

La URL y claves que configurarás en Render/Vercel son las de ese mismo proyecto. Los marcadores de producción que aparecen más abajo se refieren al Supabase actual que quedará conectado a la aplicación publicada.

## 9. Crear backend Docker en Render

Para conservar el servicio Node actual mientras se prepara el cambio, crear un Web Service Docker nuevo conectado al mismo repositorio GitHub. Darle un nombre como `siniestralidad-api-cartera`.

Configuración inicial:

| Campo | Valor |
| --- | --- |
| Branch | `feature/noergon-redesign`, o la rama que acabas de subir |
| Runtime / Language | Docker |
| Root Directory | Vacío |
| Dockerfile Path | `backend/Dockerfile` |
| Docker Build Context | `.` |
| Docker Command | Vacío: usa el CMD del Dockerfile |
| Health Check Path | `/health` |

No configurar `npm ci`/`npm start` como comandos separados del servicio Docker; el Dockerfile ya se ocupa de instalar, compilar y arrancar. La raíz/contexto del repositorio permite copiar también `shared`.

Variables del nuevo backend:

```env
SUPABASE_URL=URL_DEL_SUPABASE_DE_PRODUCCION
SUPABASE_PUBLISHABLE_KEY=CLAVE_PUBLICA_DE_PRODUCCION
SUPABASE_SECRET_KEY=CLAVE_SECRETA_DE_PRODUCCION
FRONTEND_ORIGIN=https://siniestralidad-div.vercel.app
PORTFOLIO_ADMIN_ENABLED=true
```

Sustituir el dominio de FRONTEND_ORIGIN si tu dominio real de Vercel es distinto; sin barra final. Render proporciona PORT. Si se autorizan varios orígenes, separarlos por coma.

Desplegar ese servicio y revisar sus logs. El Dockerfile instala Poppler y Tesseract automáticamente. Copiar la URL exacta del servicio y abrir `https://URL_REAL_DEL_BACKEND/health` para comprobar el resultado.

Si el plan de Render ofrece Shell, comprobar opcionalmente `pdftotext -v` y `tesseract --list-langs`. La prueba de extracción desde la aplicación es la comprobación funcional definitiva.

Documentación oficial: https://render.com/docs/docker y https://render.com/docs/web-services.

## 10. Preparar Vercel

En el proyecto Vercel conectado a este repositorio, comprobar:

| Campo | Valor |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Variables para el entorno Production:

```env
VITE_API_URL=https://URL_REAL_DEL_NUEVO_BACKEND_RENDER
VITE_SUPABASE_URL=URL_DEL_SUPABASE_DE_PRODUCCION
VITE_SUPABASE_PUBLISHABLE_KEY=CLAVE_PUBLICA_DE_PRODUCCION
VITE_PORTFOLIO_ADMIN_ENABLED=true
```

VITE_API_URL debe ser la URL real del nuevo backend, sin `/api` ni barra final. No incluir SUPABASE_SECRET_KEY en Vercel ni en variables VITE_. Los cambios de variables se incorporan con una compilación nueva.

Si se usan Preview deployments, configurar sus variables por separado. Un Preview remoto necesita un backend accesible por Internet y un origen CORS autorizado; `http://localhost:4000` apunta al computador del visitante, no al servidor. Como los datos actuales son de prueba, el Preview puede usar ese mismo backend y Supabase; autoriza su dominio concreto en FRONTEND_ORIGIN antes de probarlo.

Documentación oficial: https://vercel.com/docs/git y https://vercel.com/docs/environment-variables.

## 11. Publicar la rama principal

Con el backend Docker funcionando, el SQL aplicado y las variables preparadas:

1. En GitHub, abrir Pull Request desde `feature/noergon-redesign` hacia la rama de producción del proyecto (habitualmente `main`). Revisar y resolver conflictos antes de integrar.
2. Hacer merge cuando estés listo para publicar.
3. En el servicio Docker nuevo de Render, cambiar Branch a la rama de producción y desplegar el commit integrado.
4. En Vercel, desplegar ese mismo código desde la rama de producción. Si el despliegue automático está activo, revisar el que dispara el merge; si lo pausaste, iniciar el despliegue manual correspondiente.
5. Esperar a que ambos despliegues finalicen correctamente antes de dar por terminado el cambio.

No retirar el backend anterior hasta comprobar el funcionamiento completo del nuevo.

## 12. Verificación final

Abrir la URL real de Vercel, iniciar sesión con tu administrador de producción y comprobar cartera, reportes, lectura de contratos, carga autorizada de PDF, extracción, permisos y original privado. Para pruebas que crean registros, usar un cliente de prueba claramente identificado y autorizado.

Si aparece un error de CORS: comprobar FRONTEND_ORIGIN y el dominio exacto de Vercel. Si falta una tabla/RPC: revisar la aplicación del SQL. Si falta una herramienta OCR: comprobar que VITE_API_URL apunta al servicio Docker nuevo. Si cambia una variable VITE_, recompilar/volver a desplegar frontend.

La guía de reversión sin borrar datos está en `docs/ADMINISTRACION_CARTERA.md`; los scripts son `docs/REVERSIÓN_CARTERA.sql` y `docs/REACTIVAR_CARTERA.sql`.

## Formatos actuales y logo (actualización)

Los archivos suministrados tienen 144 filas de primas (3 clientes, noviembre 2023–octubre 2025) y 28.456 filas de gastos. El parser une `Rut Cliente` con `DV`, conserva el número de póliza y admite `PERIODO` como fecha local o YYYYMM. La descarga conserva también el plan original; los planes sin cobertura reconocible se marcan para revisión sin cambiar la regla histórica de clasificación.

El logo oficial está incluido como recurso estático `frontend/public/noergon-brand.png`, copiado del archivo proporcionado por el usuario. Se utiliza en reportes, portada, presentación y PDF; los logos particulares de clientes/corredoras se conservan junto a la marca NOERGON. No necesitas subir este logo por cliente ni guardarlo en Supabase.

Para validar los archivos de origen, desde `backend`:

```bash
node --import tsx scripts/validate-current-inputs.mjs \
  '/home/naro1/Descargas/Data-to-Sinienstralidad-App/Sabana de primas 3.xlsx' \
  '/home/naro1/Descargas/Data-to-Sinienstralidad-App/Sabana_de_Gastos3_depurada.csv'
```

La validación usa PostgreSQL aislado en memoria; no escribe en Supabase. Para cargar realmente los datos, entrar con el administrador en Reportes y cargar primero primas y después gastos. La opción «Actualizar solo los clientes del archivo» conserva clientes ausentes; para cada cliente incluido sustituye su sábana de ese tipo, por lo que el archivo debe contener todo su histórico que quieras conservar. «Reemplazar la sábana completa» retira del conjunto vigente los clientes ausentes del archivo; conserva snapshots, identidades y asignaciones.
