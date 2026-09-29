# Siniestralidad_Div - Contexto del proyecto

## Repositorio
GitHub:
https://github.com/Nsro001/Siniestralidad_Div

Producción:
https://siniestralidad-div.vercel.app

Branch principal:
main

## Estructura
- frontend/
  - React
  - TypeScript
  - Vite
  - Tailwind
  - Recharts

- backend/
  - Node.js
  - Express
  - TypeScript
  - xlsx
  - multer

- shared/

## Objetivo
Sistema de análisis de siniestralidad para seguros colectivos.

Carga:
1. Sábana de Primas
2. Sábana de Gastos

## Funcionalidades actuales
- Upload de primas
- Upload de gastos
- Filtro por cliente
- Filtro por cobertura
- Filtro por período
- Vigencia actual
- Últimos 12 meses
- Todos los períodos
- Selección personalizada

## Coberturas
- Salud
- Dental
- Catastrófico
- Consolidado S+D+C

## Reportes actuales
- Siniestralidad por cobertura
- Distribución de prestaciones
- Salud del sistema
- Salud por prestación
- Top prestadores
- Top asegurados

## Resumen ejecutivo
Se agregó:
- Consolidado Salud + Dental + Catastrófico
- Siniestralidad Salud
- Siniestralidad Dental
- Prima UF
- Gasto UF
- Titulares con uso
- Cargas con uso
- Número de períodos

## Regla titulares/cargas
Los titulares y cargas actuales corresponden a personas que aparecen
en la sábana de gastos.

NO representan necesariamente el total vigente de asegurados.

Para obtener:
- titulares vigentes
- cargas vigentes
- total asegurados
- tasa de utilización

se necesita incorporar una tercera sábana:
"Nómina de Asegurados" o censo.

## Archivos relevantes

Frontend:
- frontend/src/App.tsx
- frontend/src/api.ts
- frontend/src/types.ts
- frontend/src/components/ExecutiveSummary.tsx
- frontend/src/components/PrimasCharts.tsx
- frontend/src/styles.css

Backend:
- backend/src/index.ts
- backend/src/parser.ts
- backend/src/report.ts
- backend/src/types.ts
- backend/src/storage.ts

## Backend endpoints

POST
/upload/primas

POST
/upload/gastos

GET
/filters

GET
/report/primas

GET
/report/gastos

GET
/report/claimants

## Datos del Excel de gastos utilizados
Se incorporó lectura de:
- Paciente
- dvg
- Parentesco

Regla:
Parentesco = T -> titular
otros valores -> carga

## Última modificación realizada

Se rediseñó ExecutiveSummary.tsx para PDF (2026-09-05).

Objetivo visual:

Tres círculos en la parte superior:

1. Consolidado S+D+C
2. Salud
3. Dental

Cada círculo muestra:
- solo % de siniestralidad
- nombre debajo
- período corto debajo

Ejemplo:
Nov 2024 a Oct 2025

Luego tabla compacta:
- Titulares con uso
- Cargas con uso

Luego tabla de:
- Cobertura
- Prima UF
- Gasto UF
- Siniestralidad

La tabla actual de primas está correcta.

## Ejemplo de resultados actuales INTERANDINA

Período:
Nov 2024 - Oct 2025

Salud:
Prima UF 1.527,35
Gasto UF 1.401,47
Siniestralidad ~91,8%

Dental:
Prima UF 149,37
Gasto UF 150,77
Siniestralidad ~100,9%

Consolidado:
Prima UF 1.676,72
Gasto UF 1.552,24
Siniestralidad ~92,6%

Titulares con uso:
88

Cargas con uso:
80

## Deploy

GitHub está conectado a Vercel.

Workflow:
editar
-> npm run build
-> git add .
-> git commit
-> git push
-> Vercel redeploy automático

## Entorno local

Ruta:
~/Documentos/Siniestralidad

Node:
v24.19.0

npm:
11.16.0

## Git

Remote:
origin

Repo:
Nsro001/Siniestralidad_Div

Branch:
main

Autenticación:
GitHub Fine-grained Personal Access Token

Permisos:
Contents -> Read and write
Metadata -> Read-only

## Próximos objetivos

1. Activar usuarios y clientes en Supabase siguiendo SETUP_SUPABASE.md
2. Validar el flujo real administrador → ejecutivo y el PDF después del despliegue
3. Agregar nómina de asegurados
4. Calcular tasa de utilización
5. Siniestralidad per cápita
6. Comparación período vigente vs período anterior
7. Indicadores de frecuencia y severidad
8. Dashboard de renovación

## Sistema de usuarios y clientes (implementado localmente; activación pendiente)

- Login por correo/contraseña con Supabase Auth; sin registro público en la interfaz.
- Administrador: carga sábanas, crea ejecutivos y asigna clientes; puede activar/desactivar ejecutivos.
- Ejecutivo: selecciona y consulta exclusivamente clientes asignados.
- Todos pueden cambiar su propia contraseña.
- Backend en Render: https://siniestralidad-div.onrender.com.
- Supabase: https://kzgpjjsyetddludeqkwv.supabase.co.
- Datos persistentes por cliente/tipo en PostgreSQL; autorización en backend y RLS en la base.
- Cada carga sustituye la sábana del cliente/tipo incluido, conservando los demás clientes.
- El reporte actual y sus cálculos se conservan.
- La configuración local incluye solo URL y clave pública en archivos ignorados por Git.
- Pendiente externo: ejecutar migración, desactivar registro público, crear primer administrador y configurar Render/Vercel antes de desplegar.
- Instrucciones completas: SETUP_SUPABASE.md.

Archivos añadidos relevantes:
- frontend/src/AuthApp.tsx
- frontend/src/components/Login.tsx
- frontend/src/components/AdminAccounts.tsx
- frontend/src/lib/supabase.ts
- backend/src/app.ts
- backend/src/supabase.ts
- supabase/migrations/202609060001_accounts.sql
- backend/tests/access.test.ts

Endpoints añadidos:
- GET /health (público, estado del proceso)
- GET /me (sesión requerida)
- GET /admin/users (administrador)
- POST /admin/users (administrador, crea ejecutivo)
- PUT /admin/users/:id (administrador, estado/nombre/asignaciones)

Los endpoints existentes ahora requieren sesión; las cargas requieren administrador.

## Cargas CSV y por chunks (2026-09-29; migración pendiente de aplicar)

- Se mantienen XLS/XLSX; CSV UTF-8 es el formato recomendado para gastos grandes.
- CSV admite BOM, coma o punto y coma, comillas escapadas y saltos dentro de campos. Usa los mismos encabezados y parsers de negocio. Fechas: ISO, día/mes/año o serial Excel.
- Límite HTTP: 30 MB por archivo; límite de datos procesados: 25 MB JSON.
- `saveRows` usa begin/append/finish_dataset_upload, con UUID, hasta 500 filas o 512 KiB por chunk y hasta tres intentos para errores transitorios.
- Staging privado con RLS y RPC exclusivas de administradores activos, restringidas al creador de la carga. No usa service role.
- Publicación atómica después de verificar todos los chunks y el total de filas; mantiene `client_datasets`, sus políticas y el trigger de cartera. Importación parcial y reemplazo global conservan su semántica.
- Un fallo intermedio conserva las sábanas vigentes. El cierre es idempotente incluso si se perdió su respuesta. Si se agotan los intentos, se puede volver a cargar el archivo (nueva sesión); no hay reanudación entre solicitudes HTTP.
- Staging y recibos caducan a los siete días y se limpian al iniciar otra carga. Los chunks completados se eliminan al publicar. No se limpian datos publicados.
- Aplicar `supabase/migrations/202609290001_chunked_dataset_upload.sql` después de las migraciones existentes y antes de desplegar backend. Las RPC anteriores siguen disponibles.
- La transacción final aún agrupa y escribe los datos en PostgreSQL; validar duración en Supabase con el archivo real. No se incrementa `statement_timeout`.

## Diagnóstico de conexión durante carga CSV (2026-09-29)

- Migración de chunks aplicada por el usuario y RPC verificadas; versión inicial publicada en el commit 67277eb.
- CSV real validado localmente: 25.472 filas de datos, 62 columnas, UTF-8, separador `;`, sin columnas inconsistentes.
- Se corrigió la retención de todas las celdas CSV: generador + bloques de 250 filas. El backend sigue reteniendo el archivo y las filas procesadas; no es streaming HTTP completo.
- `saveRows` cuenta bytes por fila para evitar otra copia JSON completa. Mantiene el límite de 25 MiB y los chunks de 500 filas/512 KiB.
- Logs aportados: lecturas/auth de Supabase correctas, sin RPC de carga en el extracto; no prueban reinicio de Render. La memoria elevada observada localmente justifica la corrección, pero la causa del fallo de producción debe confirmarse con logs de Render o nueva carga.
