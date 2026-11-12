# PasajerosAr

Proyecto web independiente para la experiencia de compra y consulta de pasajes de pasajeros. No modifica ni comparte el repositorio de `transporte`.

## Ejecutar

```powershell
npm install
npm run dev
```

Para validar la compilación de producción:

```powershell
npm run build
```

## Estado actual

La aplicación es un prototipo navegable de frontend para pasajeros. Los horarios, categorías, disponibilidad y precios son datos de demostración. La búsqueda, el formulario, la vista de pasaje, la cuenta y el seguimiento no se conectan a servicios reales. Se puede elegir asiento por piso y generar un QR local de prueba con los datos ingresados y el asiento elegido; el QR contiene el contenido sin cifrar, no es válido para viajar y solo debe probarse con datos ficticios. El formulario no envía ni guarda datos y no procesa pagos. La consulta manual por DNI no pertenece a este sitio.

## Arquitectura acordada

El código de este proyecto es independiente, pero el backend previsto es el Supabase que ya utiliza `transporte`. La integración todavía no está activada. El esquema actual contiene empresas, recorridos, paradas, salidas y viajes; no contiene tablas/migraciones de venta de pasajes, tarifas ni cuentas de pasajeros. Las políticas actuales son para personal autenticado, por lo que la web no debe leer esas tablas directamente como usuario anónimo.

El administrador general conserva la gestión del catálogo de recorridos y paradas. El admin de empresa ya permite crear planos de hasta dos pisos y asignarlos a una unidad. Se agregó una categoría configurable por asiento (Común, Semicama, Cama, Premium o Cama premium) para representar, por ejemplo, una planta alta semicama y una baja cama/premium, además del tipo Minibús en la flota. La cantidad de pisos se deriva del plano asignado. Las unidades asignadas a un plano se reasignan antes de eliminarlo; los planos que referencian viajes se conservan para mantener el historial. Cada administrador de empresa deberá cargar también tarifas por salida/servicio, tramo y categoría del asiento. La siguiente fase requiere funciones de servidor para exponer servicios, tarifas y disponibilidad, procesar Mercado Pago y emitir/validar pasajes. La validación manual por DNI se ubicó en el lector del conductor durante un viaje; su búsqueda y registro requieren las RPC seguras `lookup_ticket_by_dni` y `board_ticket_by_dni`, que todavía no existen en las migraciones.

## Integraciones necesarias antes de operar

- API autenticada para consultar disponibilidad, servicios y paradas; debe resolver el aislamiento multiempresa en el servidor.
- Procesador de pagos y emisión del pasaje solo tras confirmación verificada del pago.
- Mercado Pago debe confirmarse mediante notificación autenticada del servidor. Sus credenciales no deben estar en el frontend.
- Panel de empresa para configurar tarifas por salida y par de paradas, y consultar ventas/pasajeros.
- Las migraciones `transporte/supabase/migrations/0009_seat_classes_and_vehicle_kinds.sql`, `0010_delete_seat_layout.sql` y `0011_service_delete_and_date.sql` deben aplicarse para usar categorías de asiento, unidades Minibús, eliminación segura de disposiciones/servicios y selección de fecha de salida. No se aplicaron a ninguna base.
- QR real único y protegido que vincule los datos registrados del pasajero (nombre, apellido, DNI, fecha de nacimiento y correo), servicio, tramo y asiento sin exponerlos como texto legible; solo se validará desde el flujo autorizado del conductor. El QR de este prototipo es una simulación local en texto claro y no implementa esa protección.
- Cuenta de pasajeros, envío de pasajes por correo y generación de PDF con la información confirmada del servicio, paradas y datos registrados del pasajero.
- Seguimiento GPS y respaldo de búsqueda por DNI dentro de un viaje activo, limitado a conductores autenticados y sus servicios, con auditoría de consultas.
- Política de privacidad, retención mínima de datos y flujos definidos para cancelaciones/reembolsos.

El proyecto usa su propio manifiesto y estructura. La conexión futura con el sistema operativo existente debe hacerse mediante contratos de API autenticados; no se comparten credenciales desde el frontend.
