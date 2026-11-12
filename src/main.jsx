import { Fragment, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import "./style.css";

const seatClasses = {
  common: "Común",
  semicama: "Semicama",
  cama: "Cama",
  premium: "Cama premium",
};

function demoFloor(floor, seatClass, price, firstSeat, count, unavailable) {
  const seats = Array.from({ length: count }, (_, index) => {
    const number = String(firstSeat + index).padStart(2, "0");
    return {
      number,
      floor,
      seatClass,
      price,
      available: !unavailable.includes(number),
      row: Math.floor(index / 4) + 1,
      column: (index % 4) + 1,
    };
  });
  const rows = [];
  for (let index = 0; index < seats.length; index += 4) rows.push(seats.slice(index, index + 4));
  return { floor, seatClass, rows, seats };
}

const trips = [
  {
    id: "214",
    company: "Río Paraná",
    type: "Semicama",
    vehicleType: "colectivo",
    vehicleLabel: "Colectivo",
    layoutName: "Convencional 2+2",
    floors: [demoFloor(1, "semicama", 4500, 1, 12, ["02", "03", "06", "07", "10", "11"])],
    departure: "07:30",
    arrival: "09:10",
    duration: "1 h 40 min",
    stops: "1 parada",
    stopPoints: [
      { name: "Paraná", time: "07:30" },
      { name: "Colonia Avellaneda", time: "08:15" },
      { name: "Santa Fe", time: "09:10" },
    ],
    price: 4500,
    amenities: ["Aire acondicionado", "Equipaje de mano"],
    color: "blue",
  },
  {
    id: "108",
    company: "Litoral Bus",
    type: "Común",
    vehicleType: "minibus",
    vehicleLabel: "Minibús",
    layoutName: "Minibús 12 asientos",
    floors: [demoFloor(1, "common", 3900, 1, 12, ["02", "05", "08", "11", "12", "06", "09", "10", "04", "03"])],
    departure: "09:00",
    arrival: "10:50",
    duration: "1 h 50 min",
    stops: "3 paradas",
    stopPoints: [
      { name: "Paraná", time: "09:00" },
      { name: "Crespo", time: "09:35" },
      { name: "María Grande", time: "10:00" },
      { name: "Colonia Avellaneda", time: "10:25" },
      { name: "Santa Fe", time: "10:50" },
    ],
    price: 3900,
    amenities: ["Baño", "1 valija"],
    color: "orange",
  },
  {
    id: "322",
    company: "Río Paraná",
    type: "Cama ejecutivo",
    vehicleType: "colectivo",
    vehicleLabel: "Colectivo doble piso",
    layoutName: "Piso 1 cama premium · Piso 2 semicama",
    floors: [
      demoFloor(1, "premium", 8600, 1, 8, ["02", "04", "06", "08"]),
      demoFloor(2, "semicama", 6200, 9, 20, ["09", "11", "12", "14", "16", "17", "19", "20", "22", "24", "25", "26", "27"]),
    ],
    departure: "11:15",
    arrival: "12:45",
    duration: "1 h 30 min",
    stops: "Directo",
    stopPoints: [
      { name: "Paraná", time: "11:15" },
      { name: "Santa Fe", time: "12:45" },
    ],
    price: 6200,
    amenities: ["Aire acondicionado", "Asiento reclinable"],
    color: "green",
  },
  {
    id: "407",
    company: "Río Paraná",
    type: "Combi",
    vehicleType: "combi",
    vehicleLabel: "Combi",
    layoutName: "Combi 8 asientos",
    floors: [demoFloor(1, "common", 3500, 1, 8, ["02", "04", "06", "08"])],
    departure: "12:45",
    arrival: "14:30",
    duration: "1 h 45 min",
    stops: "2 paradas",
    stopPoints: [
      { name: "Paraná", time: "12:45" },
      { name: "Crespo", time: "13:25" },
      { name: "Santa Fe", time: "14:30" },
    ],
    price: 3500,
    amenities: ["Aire acondicionado", "Equipaje de mano"],
    color: "orange",
  },
];

const sampleTicket = {
  id: "214",
  company: "Río Paraná",
  departure: "07:30",
  arrival: "09:10",
  from: "Paraná",
  to: "Santa Fe",
  date: "Sáb, 14 nov",
  seat: { number: "12", floor: 1, seatClass: "semicama", price: 4500 },
  status: "Ejemplo de diseño",
  passenger: {
    firstName: "María",
    lastName: "Pérez",
    dni: "12345678",
    birthDate: "1990-01-01",
    email: "maria.demo@example.com",
  },
  boardingStop: { name: "Paraná", time: "07:30" },
  alightingStop: { name: "Santa Fe", time: "09:10" },
};

function Icon({ name, size = 20 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    ticket: <><path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 1 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M13 5v2m0 4v2m0 4v2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    swap: <><path d="m16 3 4 4-4 4" /><path d="M4 7h16" /><path d="m8 21-4-4 4-4" /><path d="M20 17H4" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    seat: <><path d="M7 18v-5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5" /><path d="M5 18h14v3H5zM8 11V7a2 2 0 1 1 4 0v4" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
    back: <><path d="m15 18-6-6 6-6" /></>,
    bus: <><path d="M8 6v6m8-6v6M3 12h18M5 19h14a2 2 0 0 0 2-2V7a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v10a2 2 0 0 0 2 2Zm1 0v2m12-2v2" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function formatPrice(price) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(price);
}

function freeSeatsOf(trip) {
  return trip.floors.flatMap((floor) => floor.seats).filter((seat) => seat.available);
}

function priceFrom(trip) {
  const fares = freeSeatsOf(trip).map((seat) => seat.price);
  return fares.length ? Math.min(...fares) : trip.price;
}

function formatDate(value) {
  if (!value) return "Seleccioná una fecha";
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

function todayPlus(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function App() {
  const [section, setSection] = useState("search");
  const [stage, setStage] = useState("results");
  const [origin, setOrigin] = useState("Paraná");
  const [destination, setDestination] = useState("Santa Fe");
  const [date, setDate] = useState(todayPlus(2));
  const [passengers, setPassengers] = useState("1");
  const [sortBy, setSortBy] = useState("recommended");
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [seatFloor, setSeatFloor] = useState(1);
  const [boardingStop, setBoardingStop] = useState(null);
  const [alightingStop, setAlightingStop] = useState(null);
  const [demoTicket, setDemoTicket] = useState(null);
  const [notice, setNotice] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [accountMode, setAccountMode] = useState("login");
  const [printing, setPrinting] = useState(false);

  function showSection(nextSection) {
    setSection(nextSection);
    setNotice("");
  }

  function submitSearch(event) {
    event.preventDefault();
    setSection("search");
    setStage("results");
    setNotice("");
  }

  function switchLocations() {
    setOrigin(destination);
    setDestination(origin);
  }

  function chooseTrip(trip) {
    const stopPoints = trip.stopPoints.map((stop, index) => ({
      ...stop,
      name: index === 0 ? origin : index === trip.stopPoints.length - 1 ? destination : stop.name,
    }));
    setSelectedTrip({ ...trip, stopPoints });
    setSelectedSeats([]);
    setSeatFloor(trip.floors[0].floor);
    setBoardingStop(stopPoints[0].name);
    setAlightingStop(stopPoints[stopPoints.length - 1].name);
    setStage("checkout");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitDemoBooking(event) {
    event.preventDefault();
    if (selectedSeats.length !== Number(passengers)) {
      setNotice(`Elegí ${passengers} ${passengers === "1" ? "asiento" : "asientos"} disponibles para continuar.`);
      return;
    }
    const formData = new FormData(event.currentTarget);
    const boarding = selectedTrip.stopPoints.find((stop) => stop.name === boardingStop);
    const alighting = selectedTrip.stopPoints.find((stop) => stop.name === alightingStop);
    const email = String(formData.get("email") || "");
    const passengersData = Array.from({ length: Number(passengers) }, (_, index) => ({
      firstName: String(formData.get(`passengers[${index}].firstName`) || ""),
      lastName: String(formData.get(`passengers[${index}].lastName`) || ""),
      dni: String(formData.get(`passengers[${index}].dni`) || ""),
      birthDate: String(formData.get(`passengers[${index}].birthDate`) || ""),
      email,
      seat: selectedSeats[index],
    }));
    setDemoTicket({ ...selectedTrip, boardingStop: boarding, alightingStop: alighting, passengers: passengersData });
    setStage("demo-ticket");
    setNotice("Simulación únicamente: no se realizó un pago ni se emitió un pasaje válido.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function printTicket() {
    setPrinting(true);
    window.setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  }

  function sortedTrips() {
    const results = [...trips];
    if (sortBy === "price") return results.sort((a, b) => a.price - b.price);
    if (sortBy === "time") return results.sort((a, b) => a.departure.localeCompare(b.departure));
    if (sortBy === "duration") return results.sort((a, b) => a.duration.localeCompare(b.duration));
    return results.sort((a, b) => a.price - b.price || a.departure.localeCompare(b.departure));
  }

  return (
    <div className={printing ? "app is-printing" : "app"}>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => { showSection("search"); setStage("results"); }} aria-label="Pasajeros.ar, ir a buscar viaje">
            <span className="brand-mark"><Icon name="arrow" size={18} /></span>
            <span>pasajeros<span className="brand-dot">.ar</span></span>
          </button>
          <nav className="desktop-nav" aria-label="Navegación principal">
            <button className={section === "search" ? "nav-link active" : "nav-link"} onClick={() => { showSection("search"); setStage("results"); }}>Buscar viaje</button>
            <button className={section === "tickets" ? "nav-link active" : "nav-link"} onClick={() => showSection("tickets")}>Mis pasajes</button>
            <button className={section === "account" ? "nav-link active" : "nav-link"} onClick={() => showSection("account")}>Mi cuenta</button>
          </nav>
        </div>
      </header>

      <main>
        {section === "search" && stage === "results" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow"><span className="eyebrow-dot" /> TU PRÓXIMO VIAJE, MÁS CERCA</span>
                <h1>El camino empieza<br className="desktop-break" /> con un pasaje.</h1>
                <p>Compará horarios, elegí tu lugar y viajá con todo organizado desde un mismo sitio.</p>
              </div>
              <div className="hero-decoration" aria-hidden="true">
                <span className="route-line" />
                <span className="route-dot route-dot-one" />
                <span className="route-dot route-dot-two" />
                <span className="route-label route-label-one">Paraná</span>
                <span className="route-label route-label-two">Santa Fe</span>
                <span className="hero-stamp"><Icon name="bus" size={28} /></span>
              </div>
            </section>

            <section className="search-panel" aria-label="Buscar servicios">
              <form className="search-form" onSubmit={submitSearch}>
                <label className="field location-field">
                  <span className="field-label">ORIGEN</span>
                  <span className="field-control">
                    <Icon name="pin" size={18} />
                    <input aria-label="Origen" value={origin} onChange={(event) => setOrigin(event.target.value)} required />
                  </span>
                </label>
                <button className="swap-button" type="button" onClick={switchLocations} aria-label="Intercambiar origen y destino">
                  <Icon name="swap" size={18} />
                </button>
                <label className="field location-field">
                  <span className="field-label">DESTINO</span>
                  <span className="field-control">
                    <Icon name="pin" size={18} />
                    <input aria-label="Destino" value={destination} onChange={(event) => setDestination(event.target.value)} required />
                  </span>
                </label>
                <label className="field date-field">
                  <span className="field-label">FECHA DE VIAJE</span>
                  <span className="field-control">
                    <Icon name="calendar" size={18} />
                    <input aria-label="Fecha de viaje" type="date" min={todayPlus(0)} value={date} onChange={(event) => setDate(event.target.value)} required />
                  </span>
                </label>
                <label className="field passenger-field">
                  <span className="field-label">PASAJEROS</span>
                  <span className="field-control">
                    <Icon name="user" size={18} />
                    <select aria-label="Cantidad de pasajeros" value={passengers} onChange={(event) => setPassengers(event.target.value)}>
                      <option value="1">1 pasajero</option>
                      <option value="2">2 pasajeros</option>
                      <option value="3">3 pasajeros</option>
                      <option value="4">4 pasajeros</option>
                    </select>
                  </span>
                </label>
                <button className="button button-primary search-button" type="submit"><Icon name="search" size={18} /> Buscar viajes</button>
              </form>
            </section>

            <div className="content-grid">
              <section className="results-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow muted-eyebrow">OPCIONES PARA VOS</span>
                    <h2>Servicios disponibles</h2>
                    <p className="route-summary"><Icon name="pin" size={16} /> {origin || "Origen"} <Icon name="arrow" size={15} /> {destination || "Destino"} <span className="summary-separator">·</span> {formatDate(date)} <span className="summary-separator">·</span> {passengers} {passengers === "1" ? "pasajero" : "pasajeros"}</p>
                  </div>
                  <label className="sort-control">
                    <span>Ordenar por</span>
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Ordenar servicios">
                      <option value="recommended">Recomendados</option>
                      <option value="price">Menor precio</option>
                      <option value="time">Horario</option>
                      <option value="duration">Duración</option>
                    </select>
                  </label>
                </div>

                <div className="results-count">{sortedTrips().length} servicios encontrados <span>Precios por pasajero</span></div>
                <div className="trip-list">
                  {sortedTrips().map((trip) => (
                    <article className="trip-card" key={trip.id}>
                      <div className={`company-avatar ${trip.color}`}><Icon name="bus" size={19} /></div>
                      <div className="trip-main">
                        <div className="trip-company-row">
                          <div>
                            <p className="trip-company">{trip.company}<span className="trip-dot">·</span><span className="trip-type">{trip.type}</span></p>
                            <p className="trip-service">Servicio {trip.id} · {trip.vehicleLabel} · {trip.floors.length > 1 ? `${trip.floors.length} pisos` : "1 piso"}</p>
                          </div>
                          <span className={`availability ${freeSeatsOf(trip).length <= 2 ? "few-seats" : ""}`}>
                            <span /> {freeSeatsOf(trip).length} {freeSeatsOf(trip).length === 1 ? "lugar libre" : "lugares libres"}
                          </span>
                        </div>
                        <div className="trip-times">
                          <div className="time-stop"><strong>{trip.departure}</strong><span>{origin}</span></div>
                          <div className="trip-duration"><span>{trip.duration}</span><div><i /><span>{trip.stops}</span><i /></div></div>
                          <div className="time-stop align-right"><strong>{trip.arrival}</strong><span>{destination}</span></div>
                        </div>
                        <div className="amenities">
                          {trip.amenities.map((amenity) => <span key={amenity}><Icon name={amenity.includes("Aire") ? "check" : "seat"} size={14} />{amenity}</span>)}
                          {trip.floors.map((floor) => <span key={floor.floor}><Icon name="seat" size={14} />Piso {floor.floor}: {seatClasses[floor.seatClass]}</span>)}
                        </div>
                      </div>
                      <div className="trip-price">
                        <span className="price-label">Desde</span>
                        <strong>{formatPrice(priceFrom(trip))}</strong>
                        <button className="button button-primary choose-button" onClick={() => chooseTrip(trip)}>Elegir <Icon name="arrow" size={16} /></button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="trust-row">
                  <span><Icon name="shield" size={16} /> Sin envío de datos en la demo</span>
                  <span><Icon name="ticket" size={16} /> QR de prueba con asiento</span>
                  <span><Icon name="info" size={16} /> Sin pagos reales</span>
                </div>
              </section>
              <aside className="aside-card">
                <div className="aside-icon"><Icon name="ticket" size={21} /></div>
                <h3>Tu viaje, en un solo lugar</h3>
                <p>Cuando tu compra esté confirmada, vas a encontrar el pasaje y el seguimiento desde tu cuenta.</p>
                <button className="text-button" onClick={() => showSection("tickets")}>Ver mis pasajes <Icon name="arrow" size={15} /></button>
                <div className="aside-divider" />
                <div className="aside-note"><Icon name="lock" size={16} /><span>El código QR se emitirá de forma segura al confirmar tu pago.</span></div>
              </aside>
            </div>
          </>
        )}

        {section === "search" && stage === "checkout" && selectedTrip && (
          <section className="flow-page">
            <button className="back-button" onClick={() => setStage("results")}><Icon name="back" size={18} /> Volver a los servicios</button>
            <div className="flow-heading">
              <span className="eyebrow muted-eyebrow">PASO 1 DE 2</span>
              <h1>Datos del pasajero</h1>
              <p>Completá los datos de cada pasajero tal como aparecen en su documento.</p>
            </div>
            {notice && <div className="notice" role="status"><Icon name="info" size={18} />{notice}</div>}
            <div className="checkout-grid">
              <form className="form-card" onSubmit={submitDemoBooking}>
                <div className="form-card-heading"><span className="step-number">1</span><div><h2>Información personal</h2><p>Se solicitarán los datos de {passengers} {passengers === "1" ? "pasajero" : "pasajeros"}.</p></div></div>
                <div className="stop-fields">
                  <label className="input-field">
                    <span>Parada de ascenso</span>
                    <select value={boardingStop || ""} onChange={(event) => {
                      const nextBoarding = event.target.value;
                      const boardingIndex = selectedTrip.stopPoints.findIndex((stop) => stop.name === nextBoarding);
                      const alightingIndex = selectedTrip.stopPoints.findIndex((stop) => stop.name === alightingStop);
                      setBoardingStop(nextBoarding);
                      if (alightingIndex <= boardingIndex) {
                        setAlightingStop(selectedTrip.stopPoints[boardingIndex + 1].name);
                      }
                    }}>
                      {selectedTrip.stopPoints.slice(0, -1).map((stop) => <option key={stop.name} value={stop.name}>{stop.name} · {stop.time}</option>)}
                    </select>
                  </label>
                  <label className="input-field">
                    <span>Parada de descenso</span>
                    <select value={alightingStop || ""} onChange={(event) => setAlightingStop(event.target.value)}>
                      {selectedTrip.stopPoints.filter((stop) => selectedTrip.stopPoints.findIndex((item) => item.name === stop.name) > selectedTrip.stopPoints.findIndex((item) => item.name === boardingStop)).map((stop) => <option key={stop.name} value={stop.name}>{stop.name} · {stop.time}</option>)}
                    </select>
                  </label>
                </div>
                <SeatPicker
                  floors={selectedTrip.floors}
                  activeFloor={seatFloor}
                  onFloorChange={setSeatFloor}
                  selectedSeats={selectedSeats}
                  passengerCount={Number(passengers)}
                  onSelect={(seat) => {
                    const key = `${seat.floor}-${seat.number}`;
                    if (selectedSeats.some((item) => `${item.floor}-${item.number}` === key)) {
                      setSelectedSeats(selectedSeats.filter((item) => `${item.floor}-${item.number}` !== key));
                    } else if (selectedSeats.length < Number(passengers)) {
                      setSelectedSeats([...selectedSeats, seat]);
                    }
                    setNotice("");
                  }}
                />
                {Array.from({ length: Number(passengers) }, (_, index) => (
                  <section className="passenger-form-block" key={index} aria-label={`Datos del pasajero ${index + 1}`}>
                    <h3>Pasajero {index + 1} · Asiento {selectedSeats[index] ? `${selectedSeats[index].number} · piso ${selectedSeats[index].floor} · ${seatClasses[selectedSeats[index].seatClass]}` : "pendiente"}</h3>
                    <div className="form-fields">
                      <label className="input-field"><span>Nombre</span><input name={`passengers[${index}].firstName`} autoComplete={index === 0 ? "given-name" : "off"} placeholder="Como figura en tu DNI" required /></label>
                      <label className="input-field"><span>Apellido</span><input name={`passengers[${index}].lastName`} autoComplete={index === 0 ? "family-name" : "off"} placeholder="Como figura en tu DNI" required /></label>
                      <label className="input-field"><span>DNI</span><input name={`passengers[${index}].dni`} inputMode="numeric" autoComplete="off" placeholder="Sin puntos ni espacios" pattern="[0-9]{7,8}" title="Ingresá un DNI de 7 u 8 números" required /></label>
                      <label className="input-field"><span>Fecha de nacimiento</span><input name={`passengers[${index}].birthDate`} type="date" autoComplete={index === 0 ? "bday" : "off"} required /></label>
                    </div>
                  </section>
                ))}
                <div className="form-fields">
                  <label className="input-field full-width"><span>Correo electrónico para recibir los pasajes</span><input name="email" type="email" autoComplete="email" placeholder="nombre@correo.com" required /></label>
                </div>
                <label className="consent"><input type="checkbox" required /><span>Acepto el uso de mis datos para gestionar la reserva y recibir información del viaje.</span></label>
                <div className="demo-callout"><Icon name="info" size={18} /><p><strong>Prototipo de demostración.</strong> Esta pantalla no envía ni almacena tus datos y no procesa pagos ni genera pasajes.</p></div>
                <button className="button button-primary form-submit" type="submit">Ver resumen de demostración <Icon name="arrow" size={17} /></button>
              </form>
              <TripSummary trip={selectedTrip} origin={origin} destination={destination} date={date} passengers={passengers} boardingStop={boardingStop} alightingStop={alightingStop} selectedSeats={selectedSeats} />
            </div>
          </section>
        )}

        {section === "search" && stage === "demo-ticket" && (
          <section className="flow-page">
            <button className="back-button" onClick={() => { setStage("results"); setNotice(""); }}><Icon name="back" size={18} /> Volver a buscar</button>
            <div className="flow-heading">
              <span className="eyebrow muted-eyebrow">VISTA PREVIA</span>
              <h1>Así se vería tu pasaje</h1>
              <p>Este comprobante es ilustrativo y no sirve para viajar.</p>
            </div>
            {notice && <div className="notice warning" role="status"><Icon name="info" size={18} />{notice}</div>}
            {demoTicket ? demoTicket.passengers.map((passenger, index) => (
              <TicketCard key={`${demoTicket.id}-${passenger.dni}`} trip={demoTicket} passenger={passenger} ticketNumber={index + 1} origin={demoTicket.boardingStop.name} destination={demoTicket.alightingStop.name} date={date} demo onPrint={printTicket} />
            )) : <TicketCard trip={trips[0]} origin={origin} destination={destination} date={date} demo onPrint={printTicket} />}
            <button className="button button-secondary" onClick={() => showSection("tickets")}>Ir a Mis pasajes <Icon name="arrow" size={16} /></button>
          </section>
        )}

        {section === "tickets" && (
          <section className="flow-page">
            <div className="flow-heading">
              <span className="eyebrow muted-eyebrow">TU CUENTA</span>
              <h1>Mis pasajes</h1>
              <p>Tené a mano los detalles de tus próximos viajes.</p>
            </div>
            <div className="demo-callout page-callout"><Icon name="info" size={18} /><p>Estás viendo una <strong>vista de demostración</strong>. Los pasajes reales aparecerán cuando se conecte la plataforma.</p></div>
            {demoTicket ? (
              demoTicket.passengers.map((passenger, index) => (
                <TicketCard key={`${demoTicket.id}-${passenger.dni}`} trip={demoTicket} passenger={passenger} ticketNumber={index + 1} origin={demoTicket.boardingStop.name} destination={demoTicket.alightingStop.name} date={date} demo onPrint={printTicket} />
              ))
            ) : (
              <TicketCard trip={sampleTicket} passenger={sampleTicket.passenger} origin={sampleTicket.from} destination={sampleTicket.to} date={sampleTicket.date} sample onPrint={printTicket} />
            )}
            <div className="tracking-card">
              <div className="tracking-heading"><div><span className="eyebrow muted-eyebrow">SEGUIMIENTO</span><h2>Tu viaje, en movimiento</h2></div><span className="tracking-badge"><span /> Próximamente</span></div>
              <div className="tracking-map">
                <div className="map-line" />
                <span className="map-point start-point" /><span className="map-point vehicle-point"><Icon name="bus" size={14} /></span><span className="map-point end-point" />
                <span className="map-place start-place">{sampleTicket.from}</span><span className="map-place end-place">{sampleTicket.to}</span>
              </div>
              <p className="tracking-copy">El seguimiento en tiempo real se mostrará cuando la unidad comparta su ubicación.</p>
            </div>
          </section>
        )}

        {section === "account" && (
          <section className="flow-page account-page">
            <div className="flow-heading">
              <span className="eyebrow muted-eyebrow">BIENVENIDO/A</span>
              <h1>Tu cuenta de viaje</h1>
              <p>Ingresá para consultar tus pasajes y tenerlos siempre disponibles.</p>
            </div>
            <form className="form-card account-card" onSubmit={(event) => {
              event.preventDefault();
              setLoginMessage(accountMode === "register"
                ? "El registro estará disponible cuando se conecte el servicio de cuentas. Tus datos no fueron enviados."
                : "El inicio de sesión estará disponible cuando se conecte el servicio de cuentas.");
            }}>
              <div className="account-icon"><Icon name="user" size={24} /></div>
              <div className="account-mode-switch" role="group" aria-label="Tipo de acceso">
                <button type="button" className={accountMode === "login" ? "selected" : ""} onClick={() => { setAccountMode("login"); setLoginMessage(""); }}>Ingresar</button>
                <button type="button" className={accountMode === "register" ? "selected" : ""} onClick={() => { setAccountMode("register"); setLoginMessage(""); }}>Crear cuenta</button>
              </div>
              <h2>{accountMode === "register" ? "Crear tu cuenta" : "Ingresar a mi cuenta"}</h2>
              <p>{accountMode === "register" ? "Completá tus datos personales tal como figuran en tu DNI." : "Usá el correo electrónico asociado a tus pasajes."}</p>
              {accountMode === "register" && <>
                <label className="input-field"><span>Nombre</span><input autoComplete="given-name" placeholder="Como figura en tu DNI" required /></label>
                <label className="input-field"><span>Apellido</span><input autoComplete="family-name" placeholder="Como figura en tu DNI" required /></label>
                <label className="input-field"><span>DNI</span><input inputMode="numeric" autoComplete="off" placeholder="Sin puntos ni espacios" pattern="[0-9]{7,8}" title="Ingresá un DNI de 7 u 8 números" required /></label>
                <label className="input-field"><span>Fecha de nacimiento</span><input type="date" autoComplete="bday" required /></label>
              </>}
              <label className="input-field"><span>Correo electrónico</span><input type="email" autoComplete="email" placeholder="nombre@correo.com" required /></label>
              <label className="input-field"><span>Contraseña</span><input type="password" autoComplete={accountMode === "register" ? "new-password" : "current-password"} placeholder="Tu contraseña" minLength={8} required /></label>
              {accountMode === "register" && <label className="consent"><input type="checkbox" required /><span>Acepto el tratamiento de mis datos para administrar mi cuenta y mis viajes.</span></label>}
              {loginMessage && <p className="inline-status" role="status">{loginMessage}</p>}
              <button className="button button-primary form-submit" type="submit">{accountMode === "register" ? "Crear cuenta" : "Ingresar"} <Icon name="arrow" size={17} /></button>
              <div className="account-footnote"><Icon name="lock" size={15} /> Esta demostración no envía ni guarda tus datos.</div>
            </form>
          </section>
        )}

      </main>

      <footer className="footer">
        <div><span className="footer-brand">pasajeros<span>.ar</span></span><span>Una forma más simple de viajar.</span></div>
        <span className="footer-demo"><Icon name="info" size={15} /> Prototipo visual · sin pagos ni pasajes válidos</span>
      </footer>

      <nav className="mobile-nav" aria-label="Navegación inferior">
        <button className={section === "search" ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => { showSection("search"); setStage("results"); }}><Icon name="search" size={20} /><span>Buscar</span></button>
        <button className={section === "tickets" ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => showSection("tickets")}><Icon name="ticket" size={20} /><span>Mis pasajes</span></button>
        <button className={section === "account" ? "mobile-nav-item active" : "mobile-nav-item"} onClick={() => showSection("account")}><Icon name="user" size={20} /><span>Cuenta</span></button>
      </nav>
    </div>
  );
}

function SeatPicker({ floors, activeFloor, onFloorChange, selectedSeats, passengerCount, onSelect }) {
  const floor = floors.find((item) => item.floor === activeFloor) || floors[0];
  const selectedIds = new Set(selectedSeats.map((seat) => `${seat.floor}-${seat.number}`));
  const free = floors.flatMap((item) => item.seats).filter((seat) => seat.available).length;

  return (
    <section className="seat-picker" aria-label="Elegir asientos">
      <div className="seat-picker-heading">
        <div><h2>Elegí tus asientos</h2><p>Seleccioná {passengerCount} {passengerCount === 1 ? "lugar" : "lugares"} del plano de esta unidad.</p></div>
        <span>{free} disponibles</span>
      </div>
      {floors.length > 1 && (
        <div className="seat-floor-tabs" role="tablist" aria-label="Piso del vehículo">
          {floors.map((item) => (
            <button type="button" key={item.floor} role="tab" aria-selected={item.floor === activeFloor}
              className={item.floor === activeFloor ? "active" : ""}
              onClick={() => onFloorChange(item.floor)}>
              Piso {item.floor} · {seatClasses[item.seatClass]}
            </button>
          ))}
        </div>
      )}
      <div className="seat-layout-name"><Icon name="bus" size={16} /> Vista de demostración · {seatClasses[floor.seatClass]}</div>
      <div className="seat-plan" role="group" aria-label={`Asientos del piso ${floor.floor}`}>
        <div className="seat-front">Frente de la unidad</div>
        {floor.rows.map((row, rowIndex) => (
          <div className="seat-row" key={`${floor.floor}-${rowIndex}`}>
            {row.map((seat, index) => {
              const selected = selectedIds.has(`${seat.floor}-${seat.number}`);
              const full = !selected && selectedSeats.length >= passengerCount;
              return (
                <Fragment key={seat.number}>
                  {index === 2 && <span className="seat-aisle" aria-hidden="true" />}
                  <button type="button"
                    className={`seat-option ${selected ? "selected" : ""} ${seat.available ? "" : "occupied"}`}
                    disabled={!seat.available || full}
                    aria-pressed={selected}
                    aria-label={`Asiento ${seat.number}, piso ${seat.floor}, ${seatClasses[seat.seatClass]}, ${seat.available ? "disponible" : "ocupado"}`}
                    onClick={() => onSelect(seat)}>
                    <Icon name="seat" size={16} /><strong>{seat.number}</strong>
                  </button>
                </Fragment>
              );
            })}
          </div>
        ))}
      </div>
      <div className="seat-legend">
        <span><i className="free-seat" /> Disponible</span><span><i className="chosen-seat" /> Elegido</span><span><i className="taken-seat" /> Ocupado</span>
      </div>
      <p className="seat-selected-count" aria-live="polite">
        Elegidos: {selectedSeats.length} de {passengerCount}
        {selectedSeats.length > 0 && ` · ${formatPrice(selectedSeats.reduce((total, seat) => total + seat.price, 0))}`}
      </p>
    </section>
  );
}

function TripSummary({ trip, origin, destination, date, passengers, boardingStop, alightingStop, selectedSeats }) {
  const boarding = trip.stopPoints.find((stop) => stop.name === boardingStop);
  const alighting = trip.stopPoints.find((stop) => stop.name === alightingStop);
  return (
    <aside className="summary-card">
      <span className="eyebrow muted-eyebrow">RESUMEN DEL VIAJE</span>
      <h2>{origin} <Icon name="arrow" size={17} /> {destination}</h2>
      <p className="summary-date"><Icon name="calendar" size={16} /> {formatDate(date)} · {passengers} {passengers === "1" ? "pasajero" : "pasajeros"}</p>
      <div className="summary-divider" />
      <div className="summary-company"><span className={`company-avatar ${trip.color}`}><Icon name="bus" size={18} /></span><span><strong>{trip.company}</strong><small>Servicio {trip.id} · {trip.type}</small></span></div>
      <div className="summary-times"><span><strong>{trip.departure}</strong><small>{origin}</small></span><span className="summary-duration">{trip.duration}</span><span className="align-right"><strong>{trip.arrival}</strong><small>{destination}</small></span></div>
      <div className="summary-stops"><span><small>Subís en</small><strong>{boarding.name} · {boarding.time}</strong></span><span><small>Bajás en</small><strong>{alighting.name} · {alighting.time}</strong></span></div>
      <div className="summary-divider" />
      {selectedSeats.length > 0 && <div className="summary-selected-seats">{selectedSeats.map((seat, index) => <span key={`${seat.floor}-${seat.number}`}>Pasajero {index + 1}: asiento {seat.number} · piso {seat.floor} · {seatClasses[seat.seatClass]}</span>)}</div>}
      <div className="summary-total"><span>Total estimado</span><strong>{selectedSeats.length ? formatPrice(selectedSeats.reduce((total, seat) => total + seat.price, 0)) : "Elegí asientos"}</strong></div>
      <small className="summary-caption">Precio de demostración, sujeto a confirmación.</small>
    </aside>
  );
}

function TicketCard({ trip, passenger, ticketNumber = 1, origin, destination, date, demo = false, sample = false, onPrint }) {
  const [emailMessage, setEmailMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const ticketId = trip.id || "214";
  const company = trip.company || sampleTicket.company;
  const boarding = trip.boardingStop || sampleTicket.boardingStop;
  const alighting = trip.alightingStop || sampleTicket.alightingStop;
  const departure = boarding.time || trip.departure || sampleTicket.departure;
  const arrival = alighting.time || trip.arrival || sampleTicket.arrival;
  const safeOrigin = origin || sampleTicket.from;
  const safeDestination = destination || sampleTicket.to;
  const ticketDate = typeof date === "string" && date.includes("-") ? formatDate(date) : date || sampleTicket.date;
  const seat = passenger?.seat || trip.seat || sampleTicket.seat;

  useEffect(() => {
    let active = true;
    const payload = {
      format: "PasajerosArDemoTicket",
      demo: true,
      validForTravel: false,
      service: { company, number: ticketId, date: ticketDate, departure, arrival },
      route: {
        origin: safeOrigin,
        destination: safeDestination,
        boarding: { name: boarding.name, time: departure },
        alighting: { name: alighting.name, time: arrival },
      },
      passenger: passenger || sampleTicket.passenger,
      seat: { number: seat.number, floor: seat.floor, category: seatClasses[seat.seatClass] || seat.seatClass, fare: seat.price },
    };
    setQrDataUrl("");
    setQrError("");
    QRCode.toDataURL(JSON.stringify(payload), { width: 220, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setQrError("No se pudo generar el QR de prueba."); });
    return () => { active = false; };
  }, [ticketId, company, ticketDate, departure, arrival, safeOrigin, safeDestination, boarding.name, alighting.name, passenger, seat]);

  return (
    <article className="ticket-card printable-ticket">
      <div className="ticket-top">
        <div><span className="eyebrow muted-eyebrow">{demo ? "VISTA PREVIA · NO VÁLIDO" : "PASAJERO · EJEMPLO"}</span>        <h2>Pasaje {ticketNumber}</h2></div>
        <span className={demo ? "ticket-status demo-status" : "ticket-status"}><span />{demo ? "Demostración" : sampleTicket.status}</span>
      </div>
      <div className="ticket-route">
        <div><span>{company} · Servicio {ticketId}</span><strong>{departure}</strong><small>{safeOrigin}</small></div>
        <div className="ticket-route-line"><i /><Icon name="arrow" size={19} /><i /></div>
        <div className="ticket-destination"><span>{ticketDate}</span><strong>{arrival}</strong><small>{safeDestination}</small></div>
      </div>
      <div className="ticket-stop-details">
        <span><small>PARADA DE ASCENSO</small><strong>{boarding.name} · {boarding.time}</strong></span>
        <span><small>PARADA DE DESCENSO</small><strong>{alighting.name} · {alighting.time}</strong></span>
      </div>
      <div className="ticket-details">
        <div className="qr-placeholder" aria-label="Código QR de prueba, no válido para viajar">
          {qrDataUrl ? <img src={qrDataUrl} alt="QR de prueba con datos ficticios del pasaje" /> : qrError ? <small role="alert">{qrError}</small> : <span>Generando QR…</span>}
          <small>Prueba · no válido</small>
        </div>
        <div className="passenger-details">
          <span>Nombre y apellido</span><strong>{passenger ? `${passenger.firstName} ${passenger.lastName}` : "Pendiente"}</strong>
          <span>DNI</span><strong>{passenger?.dni || "Pendiente"}</strong>
          <span>Fecha de nacimiento</span><strong>{passenger?.birthDate || "Pendiente"}</strong>
          <span>Correo</span><strong>{passenger?.email || "Pendiente"}</strong>
          <span>Asiento</span><strong>{seat.number} · piso {seat.floor} · {seatClasses[seat.seatClass]}</strong>
        </div>
      </div>
      <div className="ticket-security"><Icon name="shield" size={16} /><span>QR de prueba en texto sin cifrar; contiene los datos mostrados y el asiento. Usá solo datos ficticios. No es válido para viajar.</span></div>
      <div className="ticket-actions">
        <button className="button button-primary" onClick={onPrint}><Icon name="download" size={17} /> Imprimir / guardar PDF</button>
        <button className="button button-secondary" onClick={() => setEmailMessage("El envío por correo estará disponible cuando se conecte el sistema.")}>Enviar por correo</button>
      </div>
      {emailMessage && <p className="inline-status ticket-email-status" role="status">{emailMessage}</p>}
    </article>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);

if (import.meta.hot) {
  import.meta.hot.dispose(() => root.unmount());
}
