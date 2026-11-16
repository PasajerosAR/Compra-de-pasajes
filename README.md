# Pasajeros.ar

Sitio público para pasajeros. El frontend vive en este proyecto y se conecta al mismo backend Supabase que utiliza `transporte`; no debe incluir claves privadas.

## Ejecutar localmente

En PowerShell:

```powershell
npm install
Copy-Item .env.example .env.local
```

Completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `.env.local`, luego:

```powershell
npm run dev
```

Validar la compilación de producción con `npm run build`.

## Funciones conectadas

- Búsqueda pública de salidas, tarifas y disponibilidad por tramo.
- Consulta de paradas y asientos del plano real, incluidos piso, fila y columna.
- Registro e inicio de sesión de pasajeros con nombre, apellido, DNI, fecha de nacimiento y correo.
- “Mis pasajes” consulta los pasajes comerciales asociados a la cuenta por DNI y correo.
- Visualización del QR y opción de imprimir o guardar el pasaje como PDF.
- Seguimiento de ubicación durante un viaje activo, con actualización cada 15 segundos.
- Búsqueda escribible de localidades (un nombre único se reconoce sin elegir una sugerencia), directorio de empresas con logos, enlaces compartibles y un listado paginado de las próximas salidas de cada empresa.

El portal permite comprar hasta cuatro pasajes en una sola operación de prueba. El backend reserva todos los asientos por 10 minutos; el retorno del navegador no confirma el pago y los pasajes solo aparecen en “Mis pasajes” después de que el webhook valide el estado directamente con Mercado Pago. Si el pago queda pendiente o la reserva vence, no se emiten los pasajes.

## Backend y despliegue

Aplicar en orden todas las migraciones de `D:\00 Pasajeros.ar\transporte\supabase\migrations` en el proyecto Supabase compartido. Las migraciones `0018` a `0020` agregan ventas, cuentas de pasajeros y las funciones públicas de consulta que usa este portal. La `0021` agrega a `public_trip_seats` la información de piso, fila y columna del plano. La `0022` agrega el checkout de prueba, las reservas temporales y la confirmación segura por webhook. La `0023` corrige consultas ambiguas en el portal y el estado del checkout. La `0024` elimina viajes duplicados por múltiples paradas en una localidad, filtra las paradas del viaje por localidad y devuelve el plano completo con sus coordenadas. La `0027` agrega la consulta de empresas, el perfil editable del titular y el filtro de servicios por empresa; la `0028` habilita cargar logos a los colaboradores de plataforma con permiso de edición; la `0029` agrega el listado paginado de salidas de los próximos 180 días y sus filtros por empresa.

El checkout requiere desplegar las Edge Functions `mp-oauth-start`, `mp-company-connection-status`, `mp-disconnect-company`, `create-passenger-checkout`, `mercadopago-oauth-callback` y `mercadopago-webhook`, además de los secretos de Mercado Pago y las URL HTTPS descritos en el README del backend. La empresa conecta su cuenta vendedora de prueba desde el panel; no se deben poner secretos de Mercado Pago en este proyecto ni en `.env.local`.

Configurar en Supabase Auth la URL local y la URL pública como direcciones permitidas para confirmación de correo. El sitio está preparado para publicarse bajo la ruta `/Compra-de-pasajes/` configurada en `vite.config.js`.

La clave `anon` se usa desde el frontend con las políticas y RPC del backend. **Nunca** agregar `SUPABASE_SERVICE_ROLE_KEY`, tokens de Mercado Pago ni claves de Resend a `.env.local` o a los archivos del frontend. El envío del PDF por correo se configura únicamente como secreto de Edge Functions en el proyecto `transporte`.
