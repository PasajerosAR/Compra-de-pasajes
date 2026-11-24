import QRCode from 'qrcode';

// Mismo pasaje A4 que emite la ventanilla del admin (copia de Admin-PasajerosAr/web/src/lib/ticketPrint.ts, solo formato A4).
// Si se cambia el diseño en el admin, hay que cambiarlo también acá.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const receipt = (n) => String(n).padStart(8, '0');

async function ticketHtml(t, info) {
  const qr = await QRCode.toDataURL(t.qr_code, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
  const page = `
    <section class="sheet a4">
      <header class="brand-header">
        <div><div class="eyebrow">SERVICIO INTERURBANO</div><h1>${esc(info.company)}</h1></div>
        <div class="document-label"><b>PASAJE ELECTRÓNICO</b><span>EMITIDO</span></div>
      </header>
      <div class="route-block">
        <div><span class="label">LOCALIDAD DE ORIGEN</span><strong>${esc(info.origin)}</strong></div>
        <span class="route-arrow">→</span>
        <div><span class="label">LOCALIDAD DE DESTINO</span><strong>${esc(info.destination)}</strong></div>
      </div>
      <div class="boarding-block"><div><span class="label">PARADA DE ASCENSO</span><b>${esc(t.from)}</b></div><div><span class="label">PARADA DE DESCENSO</span><b>${esc(t.to)}</b></div></div>
      <div class="trip-grid">
        <div><span class="label">FECHA DEL VIAJE</span><b>${esc(info.date)}</b></div>
        <div><span class="label">HORA DE SALIDA</span><b>${esc(info.departure)}</b></div>
        <div><span class="label">SERVICIO</span><b>${esc(info.service)}</b></div>
        <div><span class="label">ASIENTO</span><b>${esc(t.seat_label ?? 'Sin asignar')}</b></div>
      </div>
      <section class="detail-section">
        <h2>DATOS DEL PASAJERO</h2>
        <div class="passenger-grid"><div><span class="label">NOMBRE Y APELLIDO</span><b>${esc(t.passenger_name)}</b></div><div><span class="label">DOCUMENTO</span><b>DNI ${esc(t.passenger_dni)}</b></div></div>
        ${t.ticket_type ? `<div class="ticket-kind">${esc(t.ticket_type)}</div>` : ''}
      </section>
      <section class="detail-section purchase-section">
        <h2>DATOS DE LA COMPRA</h2>
        <div class="purchase-grid">
          <div class="receipt-number"><span class="label">N.º DE COMPROBANTE</span><b>${receipt(t.receiptNumber)}</b></div>
          <div><span class="label">PUNTO DE VENTA</span><b>${esc(t.salesChannel)}</b></div>
          <div><span class="label">FECHA DE EMISIÓN</span><b>${esc(t.issueDate)}</b></div>
          <div><span class="label">MEDIO DE PAGO</span><b>${esc(t.paymentMethod)}</b></div>
        </div>
      </section>
      <div class="validation-block">
        <div class="validation-copy"><b>VALIDACIÓN AL ABORDAR</b><span>Escaneá este código con el lector de la empresa.</span><div class="amount-label">IMPORTE ABONADO</div><strong class="amount">${money(t.price)}</strong></div>
        <img class="qr" src="${qr}" alt="Código QR del pasaje">
      </div>

      <footer class="passenger-info"><b>INFORMACIÓN PARA EL PASAJERO</b>
      <p>Presentate con anticipación al horario indicado. Llevá DNI para acreditar tu identidad. El pasaje debe presentarse en formato digital o impreso al abordar.</p><p class="conditions">DATOS OBLIGATORIOS: RESOLUCIÓN 47/2005. PRESENTARSE CON DNI FÍSICO.<br><br>CONDICIONES GENERALES:<br><br>1. DEVOLUCIÓN DE PASAJES: (Res. 1317/53). Dentro de las 24 hs previas: 70%. Entre 48 hs y 24 hs: 80%. Más de 48 hs: 90%. Únicamente al titular con DNI.<br><br>2. CANJE: No se admiten cambios de fecha/hora, solo devolución bajo condiciones vigentes.<br><br>3. TARJETAS: Boletos con crédito/débito no tienen devolución en efectivo.<br><br>4. EQUIPAJE: Hasta 15 kg sin cargo (Res. 47/95).<br><br>5. EQUIPAJE DE MANO: Sin responsabilidad por pérdida.<br><br>6. VALIDEZ: Solo válido con comprobante de control y en fecha/hora indicada.<br><br>7. MENORES: Menores de 5 años no pagan (sin asiento). Mayores de 5 abonarán pasaje completo. Res. SGT 43/2018.<br><br>8. ACEPTACIÓN: La compra implica aceptación de normas vigentes.<br><br>9. SEGURO: Responsabilidad Civil contratada.<br><br>10. ASIENTO: Sujeto a cambio por unidad.<br><br>11. CONTROL: Presentar al guarda/inspector si se requiere.<br><br>12. DNI: Obligatorio en servicios nacionales (Res. 76-E/2016).</p></footer>
    </section>`.replace(/<br><br>/g, ' ');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pasaje</title><style>
    @page { size: A4; margin: 12mm } body { font-size: 12px } .sheet { width: 100%; max-width: 186mm; min-height: 260mm; margin: 0 auto }
    :root { --brand: #0f5c8c; --brand-soft: #e4f0f8; --ink: #20364a; --muted: #5c6c79; --line: #c8d4de }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
    body { font-family: Arial, Helvetica, sans-serif; color: var(--ink); margin: 0 }
    .sheet { page-break-after: always; break-after: page; background: #fff }
    .sheet:last-child { page-break-after: auto; break-after: auto }
    .label, .eyebrow { display: block; color: var(--muted); font-size: 9px; letter-spacing: .06em; margin-bottom: 5px }
    .brand-header { min-height: 72px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; background: var(--brand); color: #fff; border-radius: 8px 8px 0 0 }
    .brand-header .eyebrow, .document-label span { color: #d9edf8; margin: 0 }
    h1 { font-size: 20px; line-height: 1.15; margin: 4px 0 0; overflow-wrap: anywhere }
    .document-label { display: grid; gap: 5px; text-align: right; font-size: 11px }
    .document-label span { font-size: 9px; letter-spacing: .08em }
    .route-block { display: grid; grid-template-columns: 1fr 28px 1fr; align-items: center; gap: 12px; padding: 20px; background: var(--brand-soft); border-bottom: 1px solid var(--line) }
    .route-block strong { display: block; font-size: 22px; overflow-wrap: anywhere }
    .route-arrow { text-align: center; font-size: 22px; color: var(--brand) }
    .boarding-block { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 10px 20px; border-bottom: 1px solid var(--line); background: #fbfdff }
    .boarding-block b { display: block; font-size: 12px }
    .trip-grid { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--line); margin: 16px 0; background: #f7fafc }
    .trip-grid > div, .purchase-grid > div { padding: 10px 12px; border-right: 1px solid var(--line) }
    .trip-grid > div:last-child, .purchase-grid > div:last-child { border-right: 0 }
    .trip-grid b, .purchase-grid b { display: block; font-size: 12px }
    .detail-section { margin: 14px 0 }
    .detail-section h2 { color: var(--brand); font-size: 10px; letter-spacing: .08em; margin: 0 0 8px }
    .passenger-grid { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--line); padding: 5px 0 12px }
    .passenger-grid b { display: block; font-size: 13px }
    .ticket-kind { display: inline-block; margin-top: 8px; padding: 4px 8px; color: var(--brand); background: var(--brand-soft); border-radius: 4px; font-size: 10px }
    .purchase-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line); background: #f7fafc }
    .purchase-grid > div { border-bottom: 1px solid var(--line) }
    .purchase-grid > div:nth-child(2n) { border-right: 0 }
    .purchase-grid > div:nth-last-child(-n+2) { border-bottom: 0 }
    .receipt-number b { color: var(--brand); font-size: 17px }
    .validation-block { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 18px; padding: 14px 16px; border: 1px solid var(--line); background: #fbfdff }
    .validation-copy { display: grid; gap: 5px }
    .validation-copy > b { color: var(--brand); font-size: 12px }
    .validation-copy > span, .passenger-info p { color: var(--muted); font-size: 10px; line-height: 1.45 }
    .amount-label { margin-top: 8px; font-size: 9px; color: var(--muted) }
    .amount { color: var(--brand); font-size: 23px }
    .qr { display: block; width: 42mm; height: 42mm; object-fit: contain }
    .passenger-info { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 9px }
    .passenger-info > b { color: var(--brand); letter-spacing: .03em }
    .passenger-info p { margin: 6px 0 0; letter-spacing: .03em }
    .passenger-info .conditions, .passenger-info-compact .conditions { display: block; font-size: inherit; color: var(--ink); line-height: 1.15; margin-top: 3px }
    @media print { .sheet { margin: 0 auto } }
  </style></head><body>${page}</body></html>`;
}

/** Imprime UN pasaje sin abrir ventanas nuevas (iframe oculto). */
export async function printTicketA4(ticket, info) {
  const html = await ticketHtml(ticket, info);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) { frame.remove(); throw new Error('No se pudo preparar la impresión.'); }
  doc.open(); doc.write(html); doc.close();
  await new Promise((resolve) => { frame.onload = () => resolve(); window.setTimeout(resolve, 400); });
  frame.contentWindow.focus();
  frame.contentWindow.print();
  window.setTimeout(() => frame.remove(), 60_000);
}
