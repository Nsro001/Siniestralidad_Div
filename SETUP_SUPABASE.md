# Activación de usuarios y clientes

El código está preparado para Supabase Auth y PostgreSQL. El reporte y sus cálculos se conservan. **Ejecutar estos pasos antes de publicar esta versión**: requiere tablas, primer administrador y variables en ambos servicios.

Proyecto: `https://kzgpjjsyetddludeqkwv.supabase.co`.
Frontend: Vercel (`siniestralidad-div.vercel.app`). Backend: Render (`siniestralidad-div.onrender.com`).

## 1. Crear las tablas y permisos

Abre [SQL Editor del proyecto](https://supabase.com/dashboard/project/kzgpjjsyetddludeqkwv/sql/new), pega el contenido completo de [la migración](supabase/migrations/202609060001_accounts.sql) y ejecuta **Run** una sola vez.

Crea `profiles`, `clients`, `client_assignments` y `client_datasets`, con permisos por fila (RLS). La migración no incluye usuarios ni contraseñas de prueba. Si se informa un error, la transacción completa se revierte; no ejecutes fragmentos por separado.

## 2. Configurar Auth y crear el primer administrador

En Supabase, **Authentication → Sign In / Providers**, desactiva **Allow new users to sign up**. Mantén el acceso por correo/contraseña y desactiva los accesos anónimos. Las cuentas se crearán desde administración, no desde un formulario público. Configura una longitud mínima de contraseña de 12 caracteres.

En **Authentication → Users**, usa **Add user → Create new user** para crear tu cuenta inicial con correo y contraseña propios. Confirma el correo desde el panel si se requiere; este flujo inicial no envía invitaciones.

Copia el UUID de esa cuenta y ejecuta lo siguiente en SQL Editor, sustituyendo el texto entre comillas por ese UUID:

```sql
update public.profiles
set role = 'admin', full_name = 'Administrador', active = true
where id = 'UUID_DE_TU_USUARIO';

select id, email, role, active from public.profiles where role = 'admin';
```

Verifica que aparece tu cuenta. El rol se guarda en una tabla protegida; editar los metadatos de Auth no concede permisos. Los administradores no se desactivan ni cambian de rol desde la pantalla de ejecutivos.

## 3. Configurar Render

En las variables de entorno del servicio backend:

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://kzgpjjsyetddludeqkwv.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | La clave pública `sb_publishable_…` del proyecto |
| `SUPABASE_SECRET_KEY` | Una clave `sb_secret_…` de Settings → API Keys |
| `FRONTEND_ORIGIN` | `https://siniestralidad-div.vercel.app` |

La clave secreta se pega **directamente en Render**. No debe compartirse por chat, subirse a GitHub ni incluirse en ninguna variable `VITE_`. Solo se usa en el servidor para crear cuentas Auth. Las consultas y cambios de datos usan el JWT del usuario, por lo que también el administrador pasa por RLS.

Mantén la raíz `backend`, compilación `npm ci && npm run build`, inicio `npm start` y Node.js 22 o superior. `PORT` lo proporciona Render. `FRONTEND_ORIGIN` admite varios orígenes exactos separados por coma si necesitas un frontend de pruebas.

## 4. Configurar Vercel

En las variables de entorno del frontend:

| Variable | Valor |
| --- | --- |
| `VITE_API_URL` | `https://siniestralidad-div.onrender.com` |
| `VITE_SUPABASE_URL` | `https://kzgpjjsyetddludeqkwv.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | La misma clave pública `sb_publishable_…` |

La raíz sigue siendo `frontend`, build `npm run build`, salida `dist`. Vite incorpora estas variables durante la compilación, así que se necesita un despliegue nuevo después de configurarlas.

## 5. Publicar y cargar datos

Después de completar los pasos anteriores, publica el código en GitHub y comprueba los despliegues de Render y Vercel. Deben usar la misma versión. Durante la transición el backend nuevo rechazará al frontend antiguo porque no envía sesión.

1. Inicia sesión con el administrador.
2. Carga de nuevo las sábanas en **Reportes**. Los datos de la versión anterior estaban en memoria; no existe una base anterior que migrar automáticamente.
3. Abre **Usuarios y clientes**, crea un ejecutivo con nombre, correo y contraseña inicial.
4. Selecciónalo, marca sus clientes y pulsa **Guardar cuenta y clientes**. Puedes asignar varios clientes y compartir un cliente entre varios ejecutivos.
5. Comprueba en otra sesión que el ejecutivo solo ve sus clientes y puede generar el PDF actual. Puede cambiar su contraseña desde **Mi contraseña**.
6. Prueba desactivar la cuenta o quitar un cliente: las consultas posteriores se rechazan. La pantalla revalida la cuenta al recuperar el foco y cada minuto. Los datos que ya fueron vistos o exportados no pueden retirarse retroactivamente.

Las cuentas nuevas quedan sin clientes hasta que se asignan. La aplicación no envía contraseñas por correo. Para recuperar una contraseña olvidada en esta primera versión, el administrador deberá gestionar la recuperación desde Supabase; todavía no hay un flujo de recuperación por correo en la aplicación.

## Comportamiento de las cargas

Solo el administrador puede cargar archivos. Cada archivo actualiza **la sábana del tipo cargado de cada cliente incluido** y conserva los otros clientes y el otro tipo de sábana. Por ejemplo, subir primas de A conserva las primas de B y los gastos de A. Para A, el archivo de primas debe incluir todos los períodos que quieras conservar de ese tipo: sustituye su conjunto anterior, no agrega meses.

Los clientes se identifican por el nombre exacto que entrega el parser actual. Usa el mismo nombre en primas y gastos. Los datos procesados se guardan en JSONB por cliente/tipo para conservar los cálculos; no se guarda el Excel original. Límite de archivo: 10 MB; límite de filas serializadas: 25 MB por carga. Para volúmenes mayores, divide las sábanas por cliente. Las importaciones son transaccionales.

## Desarrollo y verificación

Los archivos `frontend/.env.local` y `backend/.env` están excluidos de Git y ya contienen la URL y clave pública proporcionadas en este equipo. La clave secreta del backend queda por configurar. Para otros equipos, copia los `.env.example` y completa sus valores.

Backend (una terminal):

```bash
cd backend
npm ci
npm run dev
```

Frontend (otra terminal):

```bash
cd frontend
npm ci
npm run dev
```

Comprobaciones:

```bash
npm test --prefix backend
npm run build --prefix backend
npm run build --prefix frontend
frontend/node_modules/.bin/tsc --noEmit -p frontend/tsconfig.json
```

Las pruebas usan PostgreSQL embebido (PGlite) y un servidor HTTP local: no crean cuentas ni datos en Supabase. Cubren RLS, escritura exclusiva del administrador, acceso a clientes ajenos, desactivación, revocación, rechazo sin sesión e importaciones que conservan otros clientes. La prueba HTTP necesita permiso para abrir un puerto local.

Además se comprobó en Chromium, con servicios simulados, el login, la creación/asignación de ejecutivo, cierre de sesión, cambio de contraseña, cuenta desactivada, vista móvil y el reporte con impresión PDF. No sustituye la validación final con cuentas reales después de configurar los servicios.

## Referencias

- [Configuración de registro y acceso](https://supabase.com/docs/guides/auth/general-configuration)
- [Claves públicas y privadas](https://supabase.com/docs/guides/getting-started/api-keys)
- [Permisos por fila](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Creación de usuarios desde servidor](https://supabase.com/docs/reference/javascript/auth-admin-createuser)

## Dashboard de cartera, KAM y jefes (17-09-2026)

Después de la migración inicial, ejecutar completa y una sola vez
`supabase/migrations/202609170001_portfolio.sql` en SQL Editor. Incorpora el rol
`manager` (Jefe), la vinculación de cuentas con nombres de cartera y los permisos
por cliente. No se ha ejecutado automáticamente en el proyecto remoto.

1. Cargar nuevamente la sábana de primas desde **Reportes**, incluyendo `Póliza`,
   `N.º titulares`, `N.º carga`, `KAM` y `Jefe`.
2. En **Usuarios y clientes**, crear o elegir la cuenta, seleccionar **KAM** o
   **Jefe** y vincular el nombre tal como aparece en su columna del Excel.
   El selector sugiere los nombres importados. Guardar la cuenta.
3. En **Inicio**, el KAM ve su cartera; el jefe ve los clientes con su nombre
   en la columna Jefe y puede filtrar por KAM; el administrador ve todos.
   Pulsar un cliente abre sus reportes.

El nombre de cartera se vincula explícitamente: no se compara automáticamente
con el nombre del usuario autenticado y el Excel no crea cuentas ni roles.
Los nombres se comparan sin distinguir mayúsculas y con espacios externos
eliminados. Cada nombre solo se puede vincular a una cuenta por rol.
La última carga determina el KAM y jefe actuales de cada cliente a partir de su
último mes; valores contradictorios dentro de ese mes rechazan la carga completa.
Las asignaciones manuales existentes siguen dando acceso adicional a los KAM;
para trasladar totalmente una cartera, retirar también esas asignaciones.
Los jefes solo acceden a su equipo según la columna Jefe, sin asignaciones manuales.

Reglas acordadas:
- Prima anual estimada = suma de primas de todas las coberturas del último mes
  disponible de cada cliente × 12. Se muestra el período usado, no se supone que
  coincida con el mes actual. Los clientes sin primas no se confunden con prima cero.
- Titulares y cargas = únicamente Salud de ese mismo último mes. Si no hay
  Salud o falta una cantidad, aparece sin datos; se puede consultar el detalle
  de las pólizas de Salud. No se usan cantidades de meses anteriores. No cambia el reporte de personas con uso.
- Renovaciones estimadas = aniversario del mes del primer período disponible
  de la sábana de cada cliente. Se incluyen el mes en curso y los próximos 90 días;
  solo se muestra mes/año, porque no hay un día contractual informado. Al cargar
  un historial con otro primer mes, la estimación cambia.
- Sábanas antiguas siguen siendo legibles, pero no incluyen las nuevas cantidades
  ni la vinculación automática de cartera. Hay que volver a cargarlas para ello.

## Presentación y exploración mensual

En Reportes, **Mostrar todas** despliega las tarjetas; **Modo presentación**
recorre las seleccionadas con Mostrar, con una lámina por cobertura. Se puede
navegar con flechas, selector o botones y salir con Esc.

Pulsar un mes del gráfico de siniestralidad (o elegirlo en **Explorar mes**)
consulta `/report/monthly` con la sesión del usuario y los mismos permisos por
cliente. El panel funciona también dentro de la presentación. No requiere SQL
adicional ni utiliza IA.

La referencia son los tres meses calendario anteriores; solo promedia aquellos
con filas tanto de primas como de gastos para la cobertura. Informa los meses
faltantes y consulta todo el historial cargado. La ausencia de filas de gastos
no se considera cero. El detalle presenta variación por prestación, montos,
líneas con reembolso, pacientes identificados, monto por línea y concentración
por prestador/paciente. Los casos se numeran dentro del mes, sin enviar sus RUT
al navegador en esta respuesta. Las líneas no se interpretan como siniestros.

Hospitalización usa una lista explícita de Clasif.Cob: Hospitalización, Gastos
hospitalarios, Hospitalarios, ignorando mayúsculas y tildes. Las demás categorías
siguen apareciendo en el desglose sin reclasificación automática.

La conciliación compara Gasto UF (primas) con todos los Reembolsos del mes,
incluidos negativos. El análisis de prestaciones usa reembolsos positivos y las
mismas exclusiones que Distribución de prestaciones; muestra el importe neto que
queda fuera. Una diferencia entre las sábanas impide atribuir todo el pico del
gráfico a las prestaciones del detalle.

### Reemplazo completo de sábanas (23 de septiembre de 2026)

Ejecutar `supabase/migrations/202609230001_replace_dataset.sql` después de las migraciones de cuentas y cartera, antes de desplegar esta versión. Luego reiniciar/desplegar backend y frontend.

En Reportes, el tipo de carga «Reemplazar la sábana completa» sustituye todos los datos del tipo seleccionado (primas o gastos). Los clientes ausentes del nuevo archivo dejan de tener datos de ese tipo. Cargar ambos Excel para renovar ambas sábanas. La opción «Actualizar solo los clientes del archivo» conserva la modalidad parcial anterior. El reemplazo valida el archivo y se ejecuta en una transacción; conserva las identidades de clientes y sus asignaciones.

Inicio muestra únicamente clientes con primas cargadas; los clientes con solo gastos siguen disponibles en los filtros de reportes. Para retirar datos antiguos como POOL TRIPAN, volver a cargar los Excel vigentes con reemplazo completo. No se renombran ni se fusionan clientes por similitud de nombres.

### Lectura de Excel y conexión local

El lector limita la conversión al rango de celdas con valores para evitar recorrer filas vacías con formato hasta el final de Excel. Los gastos utilizan el encabezado `Reembolso` (columna W en la sábana actual).

En desarrollo, la interfaz llama a `/api` y Vite redirige al backend indicado en `VITE_API_URL` (por defecto `http://localhost:4000`). Deben ejecutarse ambos servicios: `npm run dev` en `backend` y en `frontend`. En producción se sigue usando `VITE_API_URL` directamente y `FRONTEND_ORIGIN` debe coincidir con el origen de la interfaz.
