import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { configured, supabase } from './supabase';
import { findPlaceByInput, normalizeText, placeLabel } from './places';
import { seatColumnTemplate } from './seatGrid';
import { printTicketA4 } from './ticketPrint';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const TODAY = today();
const COMPANY_TRIP_PAGE_SIZE = 10;
const MAX_BOOKING_DATE = (() => {
  const maxDate = new Date(`${TODAY}T12:00:00`);
  maxDate.setDate(maxDate.getDate() + 180);
  return `${maxDate.getFullYear()}-${String(maxDate.getMonth() + 1).padStart(2, '0')}-${String(maxDate.getDate()).padStart(2, '0')}`;
})();
const seatClassNames = {
  common: 'Común',
  semicama: 'Semicama',
  cama: 'Cama',
  premium: 'Cama premium',
  cama_premium: 'Cama premium'
};

// Nombres de las franjas horarias de cada empresa (las tarifas y los abonos guardan el código de la franja)
const fareBandCache = { byCompany: {}, loaded: false };
const LEGACY_BAND_NAMES = { weekday: 'días hábiles', saturday: 'sábados', sunday: 'domingos', holiday: 'feriados' };
const humanizeBand = (code) => LEGACY_BAND_NAMES[code] ?? String(code).replace(/-/g, ' ');
function loadFareBands() {
  if (fareBandCache.loaded) return Promise.resolve();
  fareBandCache.loaded = true;
  return supabase.from('fare_bands').select('company_id,code,name,sort').order('sort').then(({ data }) => {
    for (const band of data ?? []) (fareBandCache.byCompany[band.company_id] ??= []).push(band);
  });
}
// Para qué franjas vale un abono ("todos los días" si vale en todas las de la empresa)
function passDaysText(days, companyId) {
  const own = days ?? [];
  const bands = fareBandCache.byCompany[companyId] ?? [];
  const all = bands.length > 0 ? bands.every((band) => own.includes(band.code)) : ['weekday', 'saturday', 'sunday', 'holiday'].every((code) => own.includes(code));
  if (own.length === 0 || all) return 'Todos los días';
  const name = (code) => (bands.find((band) => band.code === code)?.name ?? humanizeBand(code)).toLowerCase();
  return `Solo ${own.map(name).join(', ')}`;
}

// Origen/destino con sugerencias que ignoran acentos y mayúsculas ("parana" encuentra "Paraná")
function PlaceInput({ label, value, onChange, places, placeholder, required, disabled }) {
  const [open, setOpen] = useState(false);
  const needle = normalizeText(value);
  const options = places.filter((place) => !needle || normalizeText(placeLabel(place)).includes(needle)).slice(0, 8);
  const exact = options.length === 1 && normalizeText(placeLabel(options[0])) === needle;
  return <>
    <input aria-label={label} value={value} placeholder={placeholder} required={required} disabled={disabled} autoComplete="off"
      onChange={(event) => { onChange(event.target.value); setOpen(true); }}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} />
    {open && !disabled && options.length > 0 && !exact && <ul className="place-suggestions" role="listbox" aria-label={`Sugerencias de ${label.toLowerCase()}`}>
      {options.map((place) => <li key={place.place_id} role="option" aria-selected="false"
        onMouseDown={(event) => { event.preventDefault(); onChange(placeLabel(place)); setOpen(false); }}>{placeLabel(place)}</li>)}
    </ul>}
  </>;
}

function formatPrice(value) {
  if (value == null) return 'Consultar';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(value));
}

const DEFAULT_VIEW = { section: 'search', stage: 'results', trip: null, tracking: null, back: 'tickets' };
const viewKeyOf = (v) => `${v.section}|${v.stage}|${v.trip?.trip_id ?? ''}|${v.trip?.from_stop_id ?? ''}|${v.tracking ?? ''}`;
const defaultViewState = () => ({ view: DEFAULT_VIEW, viewKey: viewKeyOf(DEFAULT_VIEW) });

function formatLongDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' })
    .format(new Date(value));
}

// Fecha real de salida (un servicio nocturno sale 00:45 ya en el día siguiente al del servicio)
function departureDay(row) {
  if (!row?.scheduled_departure) return row?.service_date;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(row.scheduled_departure));
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires'
  });
}

function errorText(error) {
  const raw = error?.message ?? String(error ?? '');
  if (raw.includes('INVALID_LOGIN_CREDENTIALS')) return 'El correo o la contraseña no son correctos.';
  if (raw.includes('EMAIL_NOT_CONFIRMED')) return 'Confirmá tu correo antes de iniciar sesión.';
  if (raw.includes('PASSENGER_PROFILE_INVALID')) return 'Revisá el nombre, apellido, DNI, fecha de nacimiento y correo.';
  if (raw.includes('23505')) return 'Ya existe una cuenta registrada con ese DNI o correo.';
  if (raw.includes('DATE_INVALID')) return 'La fecha debe estar dentro de los próximos 180 días.';
  if (raw.includes('PLACES_INVALID')) return 'Elegí un origen y un destino distintos.';
  const coded = raw.match(/^[A-Z_]{4,}:\s*(.+)$/s);
  if (coded) return coded[1];
  if (raw.includes('TRIP_UNAVAILABLE')) return 'El viaje ya no está disponible para reservar.';
  if (raw.includes('SEAT_TAKEN')) return 'Ese asiento ya fue tomado. Elegí otro.';
  return 'No se pudo completar la operación. Intentá nuevamente.';
}

// mensaje de una función de borde (usa el texto que devuelve el servidor si lo hay)
async function functionErrorText(error) {
  if (error.context instanceof Response) {
    try {
      const response = await error.context.clone().json();
      if (typeof response.error === 'string') return response.error;
    } catch { /* sin cuerpo */ }
  }
  return errorText(error);
}

function Icon({ name, size = 18 }) {
  const paths = {
    arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
    back: <path d="m15 18-6-6 6-6" />,
    bus: <><path d="M8 6v6m8-6v6M3 12h18M5 19h14a2 2 0 0 0 2-2V7a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v10a2 2 0 0 0 2 2Zm1 0v2m12-2v2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    track: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    seat: <><path d="M7 18v-5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5" /><path d="M5 18h14v3H5zM8 11V7a2 2 0 1 1 4 0v4" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    swap: <><path d="m16 3 4 4-4 4" /><path d="M4 7h16" /><path d="m8 21-4-4 4-4" /><path d="M20 17H4" /></>,
    ticket: <><path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 1 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M13 5v2m0 4v2m0 4v2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Notice({ kind = 'info', children }) {
  return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon name="info" size={17} />{children}</div>;
}

export default function App() {
  if (!configured) {
    return <div className="app"><main className="setup-page"><Notice kind="warning">Para conectar el portal, configurá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local. No uses claves secretas en esta web.</Notice></main></div>;
  }
  return <ConnectedApp />;
}

function ConnectedApp() {
  const [section, setSection] = useState(() => (new URLSearchParams(window.location.search).get('viaje') ? 'tracking' : 'search'));
  const [stage, setStage] = useState('results');
  const [session, setSession] = useState(null);
  const [places, setPlaces] = useState([]);
  const [placesLoading, setPlacesLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [, setBandsReady] = useState(false);
  useEffect(() => { void loadFareBands().then(() => setBandsReady(true)); }, []);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companiesError, setCompaniesError] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [companyId, setCompanyId] = useState(() => new URLSearchParams(window.location.search).get('empresa') ?? '');
  const [origin, setOrigin] = useState('');
  const [originInput, setOriginInput] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationInput, setDestinationInput] = useState('');
  const [date, setDate] = useState(() => new URLSearchParams(window.location.search).has('empresa') ? '' : TODAY);
  const [passengerCount, setPassengerCount] = useState('1');
  const [sortBy, setSortBy] = useState('recommended');
  const [trips, setTrips] = useState([]);
  const [totalTrips, setTotalTrips] = useState(0);
  const [companyPage, setCompanyPage] = useState(1);
  const [companyFilters, setCompanyFilters] = useState({ fromPlace: null, toPlace: null, date: null });
  const companyRequest = useRef(0);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [tripStops, setTripStops] = useState([]);
  const [boardingStop, setBoardingStop] = useState('');
  const [alightingStop, setAlightingStop] = useState('');
  const [seatOptions, setSeatOptions] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [stopsBusy, setStopsBusy] = useState(false);
  const [seatsBusy, setSeatsBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [accountMode, setAccountMode] = useState('login');
  const [authMessage, setAuthMessage] = useState('');
  const [trackingTrip, setTrackingTrip] = useState(() => new URLSearchParams(window.location.search).get('viaje') || null);
  const [trackingBack, setTrackingBack] = useState(() => (new URLSearchParams(window.location.search).get('viaje') ? 'search' : 'tickets'));
  const openedFromLink = useRef(Boolean(new URLSearchParams(window.location.search).get('viaje')));
  const [checkoutOrderId, setCheckoutOrderId] = useState('');
  const [checkoutKind, setCheckoutKind] = useState('ticket');
  const [paymentBusy, setPaymentBusy] = useState(false);

  const loadCompanyTrips = useCallback(async (targetCompanyId, page, filters) => {
    const requestId = ++companyRequest.current;
    setSearchBusy(true);
    setSearchError('');
    const { data, error } = await supabase.rpc('public_company_trips', {
      p_company: targetCompanyId,
      p_from_place: filters.fromPlace,
      p_to_place: filters.toPlace,
      p_date: filters.date,
      p_page: page,
      p_page_size: COMPANY_TRIP_PAGE_SIZE
    });
    if (requestId !== companyRequest.current) return;
    setSearchBusy(false);
    if (error) {
      setTrips([]);
      setTotalTrips(0);
      setSearchError(errorText(error));
      return;
    }
    const rows = data ?? [];
    setTrips(rows);
    setTotalTrips(Number(rows[0]?.total_count ?? 0));
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get('checkout') && query.get('order_id')) {
      setCheckoutOrderId(query.get('order_id'));
      setSection('checkoutResult');
    } else if (query.get('pass_checkout') && query.get('order_id')) {
      setCheckoutKind('pass');
      setCheckoutOrderId(query.get('order_id'));
      setSection('checkoutResult');
    }
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthMessage(errorText(error));
      setSession(data.session);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, currentSession) => setSession(currentSession));
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.rpc('passenger_places').then(({ data, error }) => {
      if (!active) return;
      setPlacesLoading(false);
      if (error) setSearchError(errorText(error));
      else setPlaces(data ?? []);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void supabase.rpc('passenger_companies').then(({ data, error }) => {
      if (!active) return;
      setCompaniesLoading(false);
      if (error) setCompaniesError(errorText(error));
      else setCompanies(data ?? []);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!companyId || companiesLoading) return;
    const match = companies.find((c) => c.company_id === companyId || c.slug?.toLowerCase() === companyId.toLowerCase());
    if (!match) return;
    if (match.company_id !== companyId) setCompanyId(match.company_id);
    const url = new URL(window.location.href);
    if (match.slug && url.searchParams.get('empresa') !== match.slug) {
      url.searchParams.set('empresa', match.slug);
      window.history.replaceState({}, '', url);
    }
  }, [companyId, companies, companiesLoading]);

  useEffect(() => {
    if (!companyId || companiesLoading) return;
    if (companies.some((c) => c.slug?.toLowerCase() === companyId.toLowerCase())) return;
    if (!companies.some((company) => company.company_id === companyId)) {
      setTrips([]);
      setTotalTrips(0);
      setSearchError('La empresa de este enlace no está disponible.');
      return;
    }
    const emptyFilters = { fromPlace: null, toPlace: null, date: null };
    setCompanyFilters(emptyFilters);
    setCompanyPage(1);
    void loadCompanyTrips(companyId, 1, emptyFilters);
  }, [companyId, companies, companiesLoading, loadCompanyTrips]);

  const companiesRef = useRef([]);
  const companyIdRef = useRef('');
  companiesRef.current = companies;
  companyIdRef.current = companyId;

  // Botones atras/adelante del navegador: cada pantalla (resultados, asientos, seguimiento, mis pasajes...) es una entrada del historial.
  const firstView = useRef(true);
  useEffect(() => {
    const view = { section, stage, trip: selectedTrip, tracking: trackingTrip, back: trackingBack };
    const state = { view, viewKey: viewKeyOf(view) };
    // el seguimiento tiene su propio enlace (?viaje=...) para poder compartirlo
    const url = new URL(window.location.href);
    if (section === 'tracking' && trackingTrip) url.searchParams.set('viaje', trackingTrip);
    else url.searchParams.delete('viaje');
    if (firstView.current) {
      firstView.current = false;
      window.history.replaceState({ ...(window.history.state ?? {}), ...state }, '', url);
      return;
    }
    if (window.history.state?.viewKey === state.viewKey) return;
    window.history.pushState(state, '', url);
  }, [section, stage, selectedTrip, trackingTrip, trackingBack]);
  useEffect(() => {
    const restoreView = (event) => {
      const view = event.state?.view ?? DEFAULT_VIEW;
      setSection(view.section);
      setStage(view.stage);
      setSelectedTrip(view.trip);
      setTrackingTrip(view.tracking);
      setTrackingBack(view.back);
    };
    window.addEventListener('popstate', restoreView);
    return () => window.removeEventListener('popstate', restoreView);
  }, []);

  useEffect(() => {
    const updateCompanyFromUrl = () => {
      const nextCompanyId = new URLSearchParams(window.location.search).get('empresa') ?? '';
      const currentCompany = companiesRef.current.find((c) => c.company_id === companyIdRef.current);
      const currentParam = currentCompany ? (currentCompany.slug || currentCompany.company_id) : companyIdRef.current;
      if (nextCompanyId.toLowerCase() === currentParam.toLowerCase() || nextCompanyId === companyIdRef.current) return;
      setCompanyId(nextCompanyId);
      setOrigin('');
      setOriginInput('');
      setDestination('');
      setDestinationInput('');
      setDate(nextCompanyId ? '' : TODAY);
      setCompanyPage(1);
      setCompanyFilters({ fromPlace: null, toPlace: null, date: null });
      setTrips([]);
      setTotalTrips(0);
      if (!nextCompanyId) {
        companyRequest.current += 1;
        setSearchBusy(false);
      }
    };
    window.addEventListener('popstate', updateCompanyFromUrl);
    return () => window.removeEventListener('popstate', updateCompanyFromUrl);
  }, []);

  useEffect(() => {
    if (!selectedTrip) return undefined;
    let active = true;
    setStopsBusy(true);
    setTripStops([]);
    setSeatOptions([]);
    setSelectedSeats([]);
    setBoardingStop('');
    setAlightingStop('');
    setCheckoutError('');
    void supabase.rpc('public_trip_city_stops', {
      p_trip: selectedTrip.trip_id,
      p_from_place: selectedTrip.origin_place_id,
      p_to_place: selectedTrip.destination_place_id
    }).then(({ data, error }) => {
      if (!active) return;
      setStopsBusy(false);
      if (error) { setCheckoutError(errorText(error)); return; }
      const nextStops = data ?? [];
      setTripStops(nextStops);
      const destinationStops = nextStops.filter((stop) => stop.place_id === selectedTrip.destination_place_id);
      const boardingIsValid = (stop) => stop?.place_id === selectedTrip.origin_place_id
        && destinationStops.some((destinationStop) => destinationStop.stop_position > stop.stop_position);
      const firstBoarding = nextStops.find((stop) => stop.stop_id === selectedTrip.from_stop_id && boardingIsValid(stop))
        ?? nextStops.find(boardingIsValid);
      const selectedAlighting = destinationStops.find((stop) =>
        stop.stop_id === selectedTrip.to_stop_id && stop.stop_position > (firstBoarding?.stop_position ?? Infinity));
      const firstAlighting = selectedAlighting
        ?? destinationStops.find((stop) => stop.stop_position > (firstBoarding?.stop_position ?? Infinity));
      if (!firstBoarding || !firstAlighting) {
        setCheckoutError('Este servicio no tiene paradas habilitadas para esas localidades en ese sentido.');
        return;
      }
      setBoardingStop(firstBoarding.stop_id);
      setAlightingStop(firstAlighting.stop_id);
    });
    return () => { active = false; };
  }, [selectedTrip]);

  useEffect(() => {
    if (!selectedTrip || !boardingStop || !alightingStop) return undefined;
    let active = true;
    setSeatsBusy(true);
    setSeatOptions([]);
    setSelectedSeats([]);
    setCheckoutError('');
    void supabase.rpc('public_trip_seats', {
      p_trip: selectedTrip.trip_id,
      p_from_stop: boardingStop,
      p_to_stop: alightingStop
    }).then(({ data, error }) => {
      if (!active) return;
      setSeatsBusy(false);
      if (error) setCheckoutError(errorText(error));
      else setSeatOptions(data ?? []);
    });
    // los asientos se actualizan solos: ventas de la taquilla, de la ventanilla u otras compras
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void supabase.rpc('public_trip_seats', {
        p_trip: selectedTrip.trip_id,
        p_from_stop: boardingStop,
        p_to_stop: alightingStop
      }).then(({ data, error }) => {
        if (!active || error || !data) return;
        setSeatOptions(data);
        setSelectedSeats((current) => {
          const still = current.filter((seat) => data.some((item) => item.cell_id === seat.cell_id && item.available));
          if (still.length !== current.length) setCheckoutError('Algún asiento que elegiste se acaba de ocupar. Elegí otro.');
          return still.length === current.length ? current : still;
        });
      });
    }, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [selectedTrip, boardingStop, alightingStop]);

  const sortedTrips = useMemo(() => {
    const copy = [...trips];
    if (companyId) return copy;
    if (sortBy === 'price') return copy.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sortBy === 'time') return copy.sort((a, b) => a.scheduled_departure.localeCompare(b.scheduled_departure));
    return copy.sort((a, b) => a.scheduled_departure.localeCompare(b.scheduled_departure));
  }, [trips, sortBy, companyId]);

  const search = async (event) => {
    event.preventDefault();
    setSearchError('');
    if (companyId && !companies.some((company) => company.company_id === companyId)) {
      setSearchError('La empresa de este enlace no está disponible.');
      return;
    }
    if (companyId) {
      if ((originInput.trim() && !origin) || (destinationInput.trim() && !destination)) {
        setSearchError('No pudimos identificar una localidad. Escribí su nombre completo o elegí una sugerencia.');
        return;
      }
      if (Boolean(origin) !== Boolean(destination)) {
        setSearchError('Completá origen y destino, o dejalos vacíos para ver todos los viajes.');
        return;
      }
      if (origin && origin === destination) {
        setSearchError('Elegí localidades distintas para el origen y el destino.');
        return;
      }
      const filters = { fromPlace: origin || null, toPlace: destination || null, date: date || null };
      setCompanyFilters(filters);
      setCompanyPage(1);
      void loadCompanyTrips(companyId, 1, filters);
      return;
    }
    if (!origin || !destination) {
      setSearchError('No pudimos identificar una localidad. Escribí su nombre completo o elegí una sugerencia.');
      return;
    }
    if (origin === destination) {
      setSearchError('Elegí localidades distintas para el origen y el destino.');
      return;
    }
    setSearchBusy(true);
    const { data, error } = await supabase.rpc('public_search_trips', {
      p_from_place: origin,
      p_to_place: destination,
      p_date: date,
      p_company: companyId || null
    });
    setSearchBusy(false);
    if (error) { setTrips([]); setTotalTrips(0); setSearchError(errorText(error)); return; }
    setTrips(data ?? []);
    setTotalTrips(data?.length ?? 0);
  };

  const setOriginFromPlace = (placeId) => {
    setOrigin(placeId);
    const place = places.find((item) => item.place_id === placeId);
    setOriginInput(place ? placeLabel(place) : '');
  };
  const setDestinationFromPlace = (placeId) => {
    setDestination(placeId);
    const place = places.find((item) => item.place_id === placeId);
    setDestinationInput(place ? placeLabel(place) : '');
  };
  const typePlace = (value, setText, setPlace) => {
    setText(value);
    const match = findPlaceByInput(value, places);
    setPlace(match?.place_id ?? '');
  };
  const selectCompany = (company) => {
    const sameCompany = company.company_id === companyId;
    const url = new URL(window.location.href);
    url.searchParams.set('empresa', company.slug || company.company_id);
    url.searchParams.delete('checkout');
    url.searchParams.delete('order_id');
    window.history.pushState(defaultViewState(), '', url);
    companyRequest.current += 1;
    setCompanyId(company.company_id);
    setSection('search');
    setStage('results');
    setSelectedTrip(null);
    setOrigin('');
    setOriginInput('');
    setDestination('');
    setDestinationInput('');
    setDate('');
    setCompanyPage(1);
    setCompanyFilters({ fromPlace: null, toPlace: null, date: null });
    setTrips([]);
    setTotalTrips(0);
    setSearchError('');
    if (sameCompany) {
      void loadCompanyTrips(company.company_id, 1, { fromPlace: null, toPlace: null, date: null });
    }
  };
  const clearCompany = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('empresa');
    window.history.pushState(defaultViewState(), '', url);
    companyRequest.current += 1;
    setSearchBusy(false);
    setCompanyId('');
    setDate(TODAY);
    setTrips([]);
    setTotalTrips(0);
    setCompanyPage(1);
    setCompanyFilters({ fromPlace: null, toPlace: null, date: null });
  };
  const changeCompanyPage = (page) => {
    if (!companyId || searchBusy) return;
    setCompanyPage(page);
    void loadCompanyTrips(companyId, page, companyFilters);
  };
  const companyShareUrl = (company) => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('empresa', company.slug || company.company_id);
    return url.toString();
  };
  const copyCompanyLink = async (company) => {
    try {
      await navigator.clipboard.writeText(companyShareUrl(company));
      setAuthMessage(`Copiaste el enlace de ${company.company_name}.`);
    } catch {
      setAuthMessage(`Copiá este enlace para compartir los viajes de ${company.company_name}: ${companyShareUrl(company)}`);
    }
  };

  const navigate = (nextSection) => {
    setAuthMessage('');
    if ((nextSection === 'tickets' || nextSection === 'account') && !session) {
      setSection('account');
      setAccountMode('login');
      if (nextSection === 'tickets') setAuthMessage('Ingresá o creá una cuenta para consultar tus pasajes.');
      return;
    }
    setSection(nextSection);
    if (nextSection === 'search') {
      setStage('results');
      setSelectedTrip(null);
    } else {
      setStage('results');
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) setAuthMessage(errorText(error));
    else { setSection('search'); setAuthMessage(''); }
  };

  const resetSearch = () => {
    setSelectedTrip(null);
    setStage('results');
    setCheckoutError('');
    setSelectedSeats([]);
  };

  // pagar un pasaje con el abono (viaje del saldo, sin pasar por Mercado Pago)
  const usePass = async (passId) => {
    if (!selectedTrip || selectedSeats.length !== 1) {
      setCheckoutError('Elegí un asiento para usar el abono.');
      return;
    }
    setPaymentBusy(true);
    setCheckoutError('');
    const { error } = await supabase.rpc('pass_redeem_web', {
      p_pass: passId, p_trip: selectedTrip.trip_id, p_from: boardingStop, p_to: alightingStop, p_seat_label: selectedSeats[0].seat_label
    });
    setPaymentBusy(false);
    if (error) { setCheckoutError(errorText(error)); return; }
    resetSearch();
    setAuthMessage('Listo: reservaste el pasaje con tu abono. Lo ves en Mis pasajes.');
    setSection('tickets');
  };

  // comprar un abono online: paga con Mercado Pago y el abono queda a nombre del DNI de la cuenta
  const buyPass = async (productId) => {
    if (!session) {
      setAuthMessage('Ingresá a tu cuenta para comprar un abono.');
      setAccountMode('login');
      setSection('account');
      return '';
    }
    const { data, error } = await supabase.functions.invoke('create-pass-checkout', { body: { product_id: productId } });
    if (error) return functionErrorText(error);
    if (typeof data?.checkout_url !== 'string') return 'No se recibió el enlace de pago de prueba.';
    setCheckoutKind('pass');
    setCheckoutOrderId(data.order_id);
    window.location.assign(data.checkout_url);
    return '';
  };

  const startTracking = (tripId, back = 'tickets') => {
    openedFromLink.current = false;
    setTrackingTrip(tripId);
    setTrackingBack(back);
    setSection('tracking');
  };

  const startPayment = async (phone, additionalPassengers, primaryPassenger) => {
    if (!session) {
      setAuthMessage('Ingresá a tu cuenta para continuar con la compra.');
      setAccountMode('login');
      setSection('account');
      return;
    }
    if (!selectedTrip || selectedSeats.length !== Number(passengerCount)) {
      setCheckoutError(`Elegí ${passengerCount} ${Number(passengerCount) === 1 ? 'asiento' : 'asientos'} para continuar.`);
      return;
    }
    setPaymentBusy(true);
    setCheckoutError('');
    const { error: profileError } = await supabase.rpc('save_passenger_profile', {
      p_first_name: primaryPassenger.first_name,
      p_last_name: primaryPassenger.last_name,
      p_dni: primaryPassenger.dni,
      p_birth_date: primaryPassenger.birth_date
    });
    if (profileError) {
      setPaymentBusy(false);
      setCheckoutError(errorText(profileError));
      return;
    }
    const { data, error } = await supabase.functions.invoke('create-passenger-checkout', {
      body: {
        trip_id: selectedTrip.trip_id,
        from_stop_id: boardingStop,
        to_stop_id: alightingStop,
        passenger_phone: phone,
        tickets: selectedSeats.map((seat, index) => ({
          layout_cell_id: seat.cell_id,
          ...(index > 0 ? {
            passenger_name: additionalPassengers[index - 1]?.passenger_name,
            passenger_dni: additionalPassengers[index - 1]?.passenger_dni,
            passenger_email: additionalPassengers[index - 1]?.passenger_email
          } : {})
        }))
      }
    });
    setPaymentBusy(false);
    if (error) {
      setCheckoutError(await functionErrorText(error));
      return;
    }
    if (typeof data?.checkout_url !== 'string') {
      setCheckoutError('No se recibió el enlace de pago de prueba.');
      return;
    }
    setCheckoutOrderId(data.order_id);
    window.location.assign(data.checkout_url);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => { navigate('search'); resetSearch(); }} aria-label="Pasajeros.ar, ir a buscar viaje">
            <span className="brand-mark"><Icon name="arrow" size={18} /></span><span>pasajeros<span className="brand-dot">.ar</span></span>
          </button>
          <nav className="desktop-nav" aria-label="Navegación principal">
            <button className={section === 'search' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('search')}>Buscar viaje</button>
            <button className={section === 'companies' ? 'nav-link active' : 'nav-link'} onClick={() => { setAuthMessage(''); setSection('companies'); }}>Empresas</button>
            <button className={section === 'passes' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('passes')}>Abonos</button>
            <button className={section === 'tickets' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('tickets')}>Mis pasajes</button>
            <button className={section === 'account' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('account')}>{session ? 'Mi cuenta' : 'Ingresar'}</button>
          </nav>
        </div>
      </header>

      <main>
        {authMessage && <Notice kind="info">{authMessage}</Notice>}
        {section === 'search' && stage === 'results' && (
          <SearchResults
            places={places} placesLoading={placesLoading} origin={origin} originInput={originInput}
            destination={destination} destinationInput={destinationInput} date={date}
            passengerCount={passengerCount} sortBy={sortBy} trips={sortedTrips} busy={searchBusy} error={searchError}
            totalTrips={companyId ? totalTrips : sortedTrips.length} page={companyPage}
            totalPages={companyId ? Math.ceil(totalTrips / COMPANY_TRIP_PAGE_SIZE) : 1}
            company={companies.find((company) => company.company_id === companyId) ?? null}
            onOrigin={setOriginFromPlace} onOriginInput={(value) => typePlace(value, setOriginInput, setOrigin)}
            onDestination={setDestinationFromPlace}
            onDestinationInput={(value) => typePlace(value, setDestinationInput, setDestination)}
            onClearCompany={clearCompany} onDate={setDate} onPassengerCount={setPassengerCount}
            onSort={setSortBy} onSearch={search} onPage={changeCompanyPage} onTrack={(tripId) => startTracking(tripId, 'search')} onChoose={(trip) => {
              const originPlaceId = trip.origin_place_id ?? origin;
              const destinationPlaceId = trip.destination_place_id ?? destination;
              setSelectedTrip({
                ...trip,
                origin_place_id: originPlaceId,
                destination_place_id: destinationPlaceId,
                origin_place_name: places.find((place) => place.place_id === originPlaceId)?.place_name ?? trip.from_stop_name,
                destination_place_name: places.find((place) => place.place_id === destinationPlaceId)?.place_name ?? trip.to_stop_name
              });
              setStage('checkout');
            }}
          />
        )}
        {section === 'companies' && (
          <CompaniesPage
            companies={companies}
            loading={companiesLoading}
            error={companiesError}
            search={companySearch}
            onSearch={setCompanySearch}
            onSelect={selectCompany}
            onCopyLink={copyCompanyLink}
          />
        )}
        {section === 'search' && stage === 'checkout' && selectedTrip && (
          <CheckoutPage
            trip={selectedTrip} stops={tripStops} stopsBusy={stopsBusy} seats={seatOptions} seatsBusy={seatsBusy}
            boardingStop={boardingStop} alightingStop={alightingStop} selectedSeats={selectedSeats}
            passengerCount={Number(passengerCount)} error={checkoutError}
            session={session} paymentBusy={paymentBusy} onLogin={() => { setAccountMode('login'); setSection('account'); }}
            onStartPayment={startPayment} onUsePass={usePass}
            onBoarding={setBoardingStop} onAlighting={setAlightingStop}
            onToggleSeat={(seat) => setSelectedSeats((current) => {
              if (current.some((selected) => selected.cell_id === seat.cell_id)) {
                return current.filter((selected) => selected.cell_id !== seat.cell_id);
              }
              return current.length < Number(passengerCount) ? [...current, seat] : current;
            })}
            onBack={resetSearch}
          />
        )}
        {section === 'account' && (
          session
            ? <AccountPage session={session} onTickets={() => navigate('tickets')} onLogout={signOut} />
            : <AuthPage mode={accountMode} setMode={setAccountMode} onSuccess={() => {
              setSection(checkoutOrderId ? 'checkoutResult' : selectedTrip ? 'search' : 'account');
              setAuthMessage('');
            }} />
        )}
        {section === 'passes' && <PassesPage onBuy={buyPass} onMine={() => navigate('tickets')} />}
        {section === 'tickets' && session && <TicketsPage onTrack={startTracking} />}
        {section === 'tracking' && trackingTrip && <TrackingPage tripId={trackingTrip} backLabel={trackingBack === 'search' ? 'Volver a los resultados' : 'Volver a mis pasajes'} onBack={() => {
          if (openedFromLink.current) { openedFromLink.current = false; setSection('search'); setTrackingTrip(null); }
          else window.history.back();
        }} />}
        {section === 'checkoutResult' && <CheckoutResultPage
          orderId={checkoutOrderId} kind={checkoutKind}
          onTickets={() => { setSection(session ? 'tickets' : 'account'); setAccountMode('login'); }}
          onSearch={() => { setCheckoutOrderId(''); setCheckoutKind('ticket'); setSection('search'); setStage('results'); setSelectedTrip(null); }}
        />}
      </main>

      <footer className="footer">
        <div><span className="footer-brand">pasajeros<span>.ar</span></span><span>Una forma más simple de viajar.</span></div>
        <span className="footer-demo"><Icon name="info" size={15} /> Compras web en modo de prueba · hasta 4 pasajes por operación</span>
      </footer>
      <nav className="mobile-nav" aria-label="Navegación inferior">
        <button className={section === 'search' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('search')}><Icon name="search" size={20} /><span>Buscar</span></button>
        <button className={section === 'companies' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => { setAuthMessage(''); setSection('companies'); }}><Icon name="bus" size={20} /><span>Empresas</span></button>
        <button className={section === 'passes' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('passes')}><Icon name="ticket" size={20} /><span>Abonos</span></button>
        <button className={section === 'tickets' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('tickets')}><Icon name="ticket" size={20} /><span>Mis pasajes</span></button>
        <button className={section === 'account' ? 'mobile-nav-item active' : 'mobile-nav-item'} onClick={() => navigate('account')}><Icon name="user" size={20} /><span>Cuenta</span></button>
      </nav>
    </div>
  );
}

function SearchResults(props) {
  const { places, placesLoading, origin, originInput, destination, destinationInput, date, passengerCount,
    sortBy, trips, busy, error, company, totalTrips, page, totalPages, onOrigin, onOriginInput,
    onDestination, onDestinationInput, onDate, onPassengerCount, onSort, onSearch, onChoose, onTrack,
    onClearCompany, onPage } = props;
  const originName = places.find((place) => place.place_id === origin)?.place_name;
  const destinationName = places.find((place) => place.place_id === destination)?.place_name;
  const resultCount = company ? totalTrips : trips.length;
  const firstResult = resultCount === 0 ? 0 : (page - 1) * COMPANY_TRIP_PAGE_SIZE + 1;
  const lastResult = Math.min(page * COMPANY_TRIP_PAGE_SIZE, resultCount);
  const swap = () => { onOrigin(destination); onDestination(origin); };
  return <>
    {company && <div className="company-filter-banner" role="status">
      <span>Mostrando pasajes de <strong>{company.company_name}</strong></span>
      <button className="text-button" onClick={onClearCompany}>Ver todas las empresas</button>
    </div>}
    <section className="hero">
      <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-dot" /> TU PRÓXIMO VIAJE, MÁS CERCA</span><h1>El camino empieza<br className="desktop-break" /> con un pasaje.</h1><p>Compará horarios y recorridos de distintas empresas en un solo sitio.</p></div>
      <div className="hero-decoration" aria-hidden="true"><span className="route-line" /><span className="route-dot route-dot-one" /><span className="route-dot route-dot-two" /><span className="route-label route-label-one">Origen</span><span className="route-label route-label-two">Destino</span><span className="hero-stamp"><Icon name="bus" size={28} /></span></div>
    </section>
    <section className="search-panel" aria-label="Buscar servicios">
      <form className="search-form" onSubmit={onSearch}>
        <label className="field location-field"><span className="field-label">ORIGEN</span><span className="field-control"><Icon name="pin" size={18} /><PlaceInput label="Origen" value={originInput} onChange={onOriginInput} places={places} placeholder="¿Desde dónde salís?" required={!company} disabled={placesLoading} /></span></label>
        <button className="swap-button" type="button" onClick={swap} aria-label="Intercambiar origen y destino"><Icon name="swap" size={18} /></button>
        <label className="field location-field"><span className="field-label">DESTINO</span><span className="field-control"><Icon name="pin" size={18} /><PlaceInput label="Destino" value={destinationInput} onChange={onDestinationInput} places={places} placeholder="¿A dónde vas?" required={!company} disabled={placesLoading} /></span></label>
        <label className="field date-field"><span className="field-label">FECHA DE VIAJE</span><span className="field-control"><Icon name="calendar" size={18} /><input aria-label="Fecha de viaje" type="date" min={TODAY} max={MAX_BOOKING_DATE} value={date} onChange={(event) => onDate(event.target.value)} required={!company} /></span></label>
        <label className="field passenger-field"><span className="field-label">PASAJEROS</span><span className="field-control"><Icon name="user" size={18} /><select aria-label="Cantidad de pasajeros" value={passengerCount} onChange={(event) => onPassengerCount(event.target.value)}>{[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'pasajero' : 'pasajeros'}</option>)}</select></span></label>
        <button className="button button-primary search-button" type="submit" disabled={busy || placesLoading}><Icon name="search" size={18} />{busy ? 'Buscando...' : 'Buscar viajes'}</button>
      </form>
    </section>
    {error && <Notice kind="error">{error}</Notice>}
    <div className="content-grid">
      <section className="results-section">
        <div className="section-heading"><div><span className="eyebrow muted-eyebrow">OPCIONES PARA VOS</span><h2>Servicios disponibles</h2><p className="route-summary"><Icon name="pin" size={16} /> {originName ?? (company ? 'Todos los orígenes' : 'Origen')} <Icon name="arrow" size={15} /> {destinationName ?? (company ? 'Todos los destinos' : 'Destino')} <span className="summary-separator">·</span> {date ? formatDate(date) : company ? 'Próximos 180 días' : formatDate(date)} <span className="summary-separator">·</span> {passengerCount} {passengerCount === '1' ? 'pasajero' : 'pasajeros'}</p></div>
          {!company && <label className="sort-control"><span>Ordenar por</span><select value={sortBy} onChange={(event) => onSort(event.target.value)} aria-label="Ordenar servicios"><option value="recommended">Horario</option><option value="price">Menor precio</option></select></label>}
        </div>
        <div className="results-count">{resultCount} {company ? 'viajes' : 'servicios'} encontrados <span>{company && resultCount > 0 ? `Mostrando ${firstResult}–${lastResult} de ${resultCount}` : 'Precios por pasajero'}</span></div>
        {busy && <p className="loading-state">Buscando salidas disponibles...</p>}
        {!busy && trips.length === 0 && <div className="empty-search"><Icon name="search" size={24} /><h3>{company ? 'No encontramos salidas' : 'Encontrá tu próximo viaje'}</h3><p>{company ? 'Probá cambiando los filtros o revisá las próximas fechas disponibles.' : 'Elegí origen, destino y fecha para consultar los servicios disponibles.'}</p></div>}
        <div className="trip-list">{trips.map((trip) => <TripCard key={trip.trip_id} trip={trip} onChoose={onChoose} onTrack={onTrack} />)}</div>
        {company && <Pagination page={page} totalPages={totalPages} onPage={onPage} disabled={busy} />}
        <div className="trust-row"><span><Icon name="shield" size={16} /> Consulta directa al sistema de viajes</span><span><Icon name="ticket" size={16} /> Pasajes vinculados a tu cuenta</span><span><Icon name="info" size={16} /> Checkout seguro en modo de prueba</span></div>
      </section>
      <aside className="aside-card"><div className="aside-icon"><Icon name="ticket" size={21} /></div><h3>Tu viaje, en un solo lugar</h3><p>Consultá tus pasajes desde tu cuenta y seguí la unidad durante el viaje.</p><div className="aside-divider" /><div className="aside-note"><Icon name="shield" size={16} /><span>Las compras se prueban con Mercado Pago en modo test y dependen de la conexión de cada empresa.</span></div></aside>
    </div>
  </>;
}

function Pagination({ page, totalPages, onPage, disabled }) {
  if (totalPages <= 1) return null;
  const visiblePages = totalPages <= 7
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : page <= 4
      ? [1, 2, 3, 4, 5, '...', totalPages]
      : page >= totalPages - 3
        ? [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
        : [1, '...', page - 1, page, page + 1, '...', totalPages];
  return <nav className="trip-pagination" aria-label="Páginas de viajes">
    <button type="button" aria-label="Página anterior" onClick={() => onPage(page - 1)} disabled={disabled || page === 1}>‹</button>
    {visiblePages.map((item, index) => item === '...'
      ? <span key={`ellipsis-${index}`} aria-hidden="true">…</span>
      : <button
        type="button"
        key={item}
        aria-label={`Página ${item}`}
        aria-current={page === item ? 'page' : undefined}
        className={page === item ? 'active' : ''}
        onClick={() => onPage(item)}
        disabled={disabled}
      >{item}</button>)}
    <button type="button" aria-label="Página siguiente" onClick={() => onPage(page + 1)} disabled={disabled || page === totalPages}>›</button>
  </nav>;
}

// logo de la empresa (o sus iniciales si no cargó uno), igual en el directorio y en abonos
function CompanyLogo({ name, logoPath }) {
  const logoUrl = logoPath ? supabase.storage.from('company-logos').getPublicUrl(logoPath).data.publicUrl : '';
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('es-AR');
  return <span className="company-card-logo">
    <span aria-hidden="true">{initials}</span>
    {logoUrl && <img src={logoUrl} alt={`Logo de ${name}`} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}
  </span>;
}

function CompaniesPage({ companies, loading, error, search, onSearch, onSelect, onCopyLink }) {
  const filteredCompanies = companies.filter((company) =>
    normalizeText(company.company_name).includes(normalizeText(search)));
  return <section className="companies-page">
    <div className="companies-heading">
      <span className="eyebrow muted-eyebrow">EMPRESAS DE VIAJE</span>
      <h1>Elegí con quién viajar.</h1>
      <p>Buscá una empresa para ver únicamente sus servicios y compartir su página.</p>
    </div>
    <label className="company-search">
      <Icon name="search" size={18} />
      <input type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar empresa..." aria-label="Buscar empresa" />
    </label>
    {error && <Notice kind="error">{error}</Notice>}
    {loading && <p className="loading-state">Cargando empresas...</p>}
    {!loading && filteredCompanies.length === 0 && <div className="empty-search"><Icon name="bus" size={24} /><h3>{search ? 'No encontramos esa empresa' : 'Todavía no hay empresas disponibles'}</h3><p>Probá con otro nombre o volvé más tarde.</p></div>}
    <div className="company-directory-grid">
      {filteredCompanies.map((company) => {
        return <article className="company-directory-card" key={company.company_id}>
          <button className="company-card-link" onClick={() => onSelect(company)}>
            <CompanyLogo name={company.company_name} logoPath={company.logo_path} />
            <strong>{company.company_name}</strong>
            <span>Ver sus pasajes <Icon name="arrow" size={15} /></span>
          </button>
          <button className="company-share-button" onClick={() => onCopyLink(company)}>Copiar enlace para compartir</button>
        </article>;
      })}
    </div>
  </section>;
}

function TripCard({ trip, onChoose, onTrack }) {
  return <article className="trip-card">
    <div className="company-avatar blue"><Icon name="bus" size={19} /></div>
    <div className="trip-main">
      <div className="trip-company-row"><div><p className="trip-company">{trip.company_name}<span className="trip-dot">·</span><span className="trip-type">{trip.route_name}</span></p><p className="trip-service">Servicio {trip.service_code}</p></div>{!trip.in_transit && <span className="availability"><span />{trip.available_seats} lugares aprox.</span>}</div>
      <div className="trip-times"><div className="time-stop"><strong>{formatTime(trip.scheduled_departure)}</strong><span>{trip.from_stop_name}</span></div><div className="trip-duration"><span>{formatDate(departureDay(trip))}</span><div><i /><span>Salida</span><i /></div></div><div className="time-stop align-right"><strong>{trip.to_stop_name}</strong><span>Destino</span></div></div>
      <div className="amenities"><span><Icon name="pin" size={14} />{trip.route_name}</span><span><Icon name="calendar" size={14} />{formatDate(departureDay(trip))}</span></div>
    </div>
    <div className="trip-price"><span className="price-label">Desde</span><strong>{formatPrice(trip.price)}</strong><div className="trip-actions">{trip.in_transit
          ? <span className="trip-in-transit">En viaje</span>
          : <button className="button button-primary choose-button" onClick={() => onChoose(trip)}>Ver asientos <Icon name="arrow" size={16} /></button>}<button className="button button-secondary track-button" onClick={() => onTrack(trip.trip_id)} aria-label={`Seguir en vivo el servicio ${trip.service_code}`} title="Seguir la unidad en vivo"><Icon name="track" size={18} /></button></div></div>
  </article>;
}

function CheckoutPage({ trip, stops, stopsBusy, seats, seatsBusy, boardingStop, alightingStop, selectedSeats, passengerCount, error, session, paymentBusy, onLogin, onStartPayment, onUsePass, onBoarding, onAlighting, onToggleSeat, onBack }) {
  const [phone, setPhone] = useState('');
  const [additionalPassengers, setAdditionalPassengers] = useState([]);
  const [primaryPassenger, setPrimaryPassenger] = useState({ first_name: '', last_name: '', dni: '', birth_date: '' });
  const [profileLoadError, setProfileLoadError] = useState('');
  const [myPasses, setMyPasses] = useState([]);
  const [passId, setPassId] = useState('');
  const [tripDayType, setTripDayType] = useState('');
  useEffect(() => {
    let active = true;
    setTripDayType('');
    void supabase.rpc('trip_day_type', { p_trip: trip.trip_id }).then(({ data }) => { if (active && data) setTripDayType(data); });
    return () => { active = false; };
  }, [trip.trip_id]);
  useEffect(() => {
    if (!session?.user?.id) { setMyPasses([]); return undefined; }
    let active = true;
    void supabase.rpc('passenger_my_passes').then(({ data }) => { if (active) setMyPasses(data ?? []); });
    return () => { active = false; };
  }, [session?.user?.id]);
  useEffect(() => {
    let active = true;
    const metadata = session?.user?.user_metadata ?? {};
    setPrimaryPassenger({
      first_name: metadata.first_name ?? '',
      last_name: metadata.last_name ?? '',
      dni: metadata.dni ?? '',
      birth_date: metadata.birth_date ?? ''
    });
    setProfileLoadError('');
    if (!session?.user?.id) return undefined;
    void supabase.from('passenger_profiles')
      .select('first_name,last_name,dni,birth_date')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error: resultError }) => {
        if (!active) return;
        if (resultError) {
          setProfileLoadError(errorText(resultError));
          return;
        }
        if (data) setPrimaryPassenger(data);
      });
    return () => { active = false; };
  }, [session?.user?.id]);
  useEffect(() => {
    setAdditionalPassengers((current) => Array.from(
      { length: Math.max(0, passengerCount - 1) },
      (_, index) => current[index] ?? { passenger_name: '', passenger_dni: '', passenger_email: '' }
    ));
  }, [passengerCount]);
  const originStops = stops.filter((stop) => stop.place_id === trip.origin_place_id
    && stops.some((destination) => destination.place_id === trip.destination_place_id
      && destination.stop_position > stop.stop_position));
  const destinationStops = stops.filter((stop) => stop.place_id === trip.destination_place_id);
  const boardingPosition = stops.find((stop) => stop.stop_id === boardingStop)?.stop_position ?? -1;
  const availableDestinations = destinationStops.filter((stop) => stop.stop_position > boardingPosition);
  const selectedDestinationIsValid = availableDestinations.some((stop) => stop.stop_id === alightingStop);
  const total = selectedSeats.every((seat) => seat.price != null) ? selectedSeats.reduce((sum, seat) => sum + Number(seat.price), 0) : null;
  const selectedPlace = (id) => stops.find((stop) => stop.stop_id === id);
  const primaryEmail = session?.user?.email ?? '';
  const primaryPassengerComplete = primaryPassenger.first_name.trim().length >= 2
    && primaryPassenger.last_name.trim().length >= 2
    && /^[0-9]{7,10}$/.test(primaryPassenger.dni.trim())
    && Boolean(primaryPassenger.birth_date);
  const extrasComplete = additionalPassengers.length === passengerCount - 1
    && additionalPassengers.every((passenger) =>
      passenger.passenger_name.trim().length >= 2
      && /^[0-9]{7,10}$/.test(passenger.passenger_dni.trim())
      && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(passenger.passenger_email.trim()));
  // abonos que sirven para este viaje: misma empresa, mismo par de localidades (en cualquier sentido), con viajes y sin vencer
  const usablePasses = myPasses.filter((pass) => pass.usable && pass.company_name === trip.company_name
    && (!tripDayType || (pass.day_types ?? []).includes(tripDayType))
    && ((pass.place_a === trip.origin_place_id && pass.place_b === trip.destination_place_id)
      || (pass.place_b === trip.origin_place_id && pass.place_a === trip.destination_place_id)));
  const chosenPass = usablePasses.find((pass) => pass.pass_id === passId) ?? usablePasses[0];
  const updateAdditionalPassenger = (index, field, value) => {
    setAdditionalPassengers((current) => current.map((passenger, passengerIndex) =>
      passengerIndex === index ? { ...passenger, [field]: value } : passenger));
  };
  return <section className="flow-page">
    <button className="back-button" onClick={onBack}><Icon name="back" size={18} /> Volver a los servicios</button>
    <div className="flow-heading"><span className="eyebrow muted-eyebrow">DETALLES DEL VIAJE</span><h1>Elegí tu tramo y asientos</h1><p>La reserva se mantiene durante 10 minutos mientras completás el pago de prueba.</p></div>
    {error && <Notice kind="error">{error}</Notice>}
    <div className="checkout-grid">
      <div className="form-card">
        <div className="form-card-heading"><span className="step-number">1</span><div><h2>{trip.company_name} · Servicio {trip.service_code}</h2><p>{formatDate(departureDay(trip))} · Sale {formatTime(trip.scheduled_departure)}</p></div></div>
        {stopsBusy ? <p className="loading-state">Cargando paradas...</p> : <>
          <div className="stop-fields">
            <label className="input-field"><span>Parada de ascenso</span><select value={boardingStop} onChange={(event) => {
              const next = event.target.value;
              onBoarding(next);
              const nextFrom = stops.find((stop) => stop.stop_id === next)?.stop_position ?? -1;
              const validDestinations = destinationStops.filter((stop) => stop.stop_position > nextFrom);
              if (!validDestinations.some((stop) => stop.stop_id === alightingStop)) onAlighting(validDestinations[0]?.stop_id ?? '');
            }} required disabled={originStops.length === 0}><option value="">Elegí una parada</option>{originStops.map((stop) => <option key={stop.stop_id} value={stop.stop_id}>{stop.stop_position}. {stop.stop_name}</option>)}</select></label>
            <label className="input-field"><span>Parada de descenso</span><select value={selectedDestinationIsValid ? alightingStop : ''} onChange={(event) => onAlighting(event.target.value)} required disabled={availableDestinations.length === 0}><option value="">Elegí una parada</option>{availableDestinations.map((stop) => <option key={stop.stop_id} value={stop.stop_id}>{stop.stop_position}. {stop.stop_name}</option>)}</select></label>
          </div>
          {seatsBusy ? <p className="loading-state">Consultando asientos para este tramo...</p> : <SeatPicker seats={seats} selectedSeats={selectedSeats} passengerCount={passengerCount} onToggle={onToggleSeat} />}
        </>}
        {selectedSeats.some((seat) => seat.price == null) && <Notice kind="warning">No hay una tarifa publicada para el tramo y la clase de asiento seleccionados.</Notice>}
        <div className="passenger-form-block">
          <h3>Pasajero 1 · Titular de la cuenta{selectedSeats[0] ? ` · Asiento ${selectedSeats[0].seat_label}` : ''}</h3>
          <div className="form-fields">
            <label className="input-field"><span>Nombre</span><input autoComplete="given-name" value={primaryPassenger.first_name} onChange={(event) => setPrimaryPassenger({ ...primaryPassenger, first_name: event.target.value })} maxLength={80} required placeholder="Tu nombre" /></label>
            <label className="input-field"><span>Apellido</span><input autoComplete="family-name" value={primaryPassenger.last_name} onChange={(event) => setPrimaryPassenger({ ...primaryPassenger, last_name: event.target.value })} maxLength={80} required placeholder="Tu apellido" /></label>
            <label className="input-field"><span>DNI</span><input inputMode="numeric" autoComplete="off" value={primaryPassenger.dni} onChange={(event) => setPrimaryPassenger({ ...primaryPassenger, dni: event.target.value.replace(/\D/g, '').slice(0, 10) })} required placeholder="7 a 10 números" /></label>
            <label className="input-field"><span>Fecha de nacimiento</span><input type="date" min="1900-01-01" max={TODAY} value={primaryPassenger.birth_date} onChange={(event) => setPrimaryPassenger({ ...primaryPassenger, birth_date: event.target.value })} required /></label>
            <label className="input-field full-width"><span>Correo</span><input value={primaryEmail} readOnly placeholder="Ingresá a tu cuenta" /></label>
          </div>
          <p className="muted profile-edit-hint">
            Podés corregir estos datos; se guardarán en tu perfil antes de iniciar el pago.
            {!primaryPassengerComplete && ' Completá nombre, apellido, DNI y fecha de nacimiento para continuar.'}
          </p>
          {profileLoadError && <Notice kind="warning">No pudimos cargar el perfil guardado. Completá los datos y los actualizaremos al continuar. {profileLoadError}</Notice>}
          <label className="input-field" style={{ marginTop: 14 }}><span>Teléfono de contacto (para todos los pasajeros)</span><input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} minLength={7} maxLength={40} required placeholder="Código de área y número" /></label>
        </div>
        {additionalPassengers.map((passenger, index) => (
          <div className="passenger-form-block" key={index}>
            <h3>Pasajero {index + 2}{selectedSeats[index + 1] ? ` · Asiento ${selectedSeats[index + 1].seat_label}` : ' · Elegí un asiento'}</h3>
            <div className="form-fields">
              <label className="input-field"><span>Nombre y apellido</span><input autoComplete="off" value={passenger.passenger_name} onChange={(event) => updateAdditionalPassenger(index, 'passenger_name', event.target.value)} maxLength={150} required placeholder="Como figura en el DNI" /></label>
              <label className="input-field"><span>DNI</span><input inputMode="numeric" autoComplete="off" value={passenger.passenger_dni} onChange={(event) => updateAdditionalPassenger(index, 'passenger_dni', event.target.value.replace(/\D/g, '').slice(0, 10))} required placeholder="7 a 10 números" /></label>
              <label className="input-field full-width"><span>Correo electrónico</span><input type="email" autoComplete="off" value={passenger.passenger_email} onChange={(event) => updateAdditionalPassenger(index, 'passenger_email', event.target.value)} maxLength={254} required placeholder="nombre@correo.com" /></label>
            </div>
          </div>
        ))}
        {additionalPassengers.length > 0 && !extrasComplete && <p className="muted passenger-form-hint">Completá nombre, DNI y correo de cada pasajero adicional antes de pagar.</p>}
        {usablePasses.length > 0 && chosenPass && <div className="passenger-form-block pass-pay">
          <h3>Pagar con tu abono</h3>
          {usablePasses.length > 1 && <label className="input-field"><span>Abono</span><select value={chosenPass.pass_id} onChange={(event) => setPassId(event.target.value)}>{usablePasses.map((pass) => <option key={pass.pass_id} value={pass.pass_id}>{pass.place_a_name} ↔ {pass.place_b_name}{pass.seat_class ? ` · ${pass.seat_class}` : ''} · quedan {pass.trips_left}</option>)}</select></label>}
          <p className="muted">Te quedan <strong>{chosenPass.trips_left}</strong> de {chosenPass.trips_total} viajes · vence el {formatDate(chosenPass.expires_at)}. Se descuenta 1 viaje por pasaje; si cancelás con 24 horas o más de anticipación, vuelve a tu saldo.</p>
          {passengerCount > 1 && <p className="muted">El abono es personal: para usarlo buscá con 1 pasajero.</p>}
          <button className="button button-secondary form-submit" type="button"
            disabled={paymentBusy || passengerCount !== 1 || selectedSeats.length !== 1 || !selectedDestinationIsValid || seatsBusy || stopsBusy}
            onClick={() => onUsePass(chosenPass.pass_id)}>{paymentBusy ? 'Reservando...' : 'Usar 1 viaje del abono'} <Icon name="ticket" size={17} /></button>
        </div>}
        {!session && <Notice kind="warning">Iniciá sesión con tu cuenta de pasajero para comprar y consultar el pasaje.</Notice>}
        <Notice kind="warning">Estás en modo de prueba. Se abrirá el checkout de prueba de Mercado Pago; no se aceptarán pagos reales.</Notice>
        <button className="button button-primary form-submit" type="button"
          disabled={paymentBusy || selectedSeats.length !== passengerCount || selectedSeats.some((seat) => seat.price == null)
            || !selectedDestinationIsValid || seatsBusy || stopsBusy || phone.trim().length < 7
            || !primaryPassengerComplete || !extrasComplete}
          onClick={() => session ? onStartPayment(phone, additionalPassengers, primaryPassenger) : onLogin()}>
          {paymentBusy ? 'Preparando el pago...' : session ? 'Continuar al pago de prueba' : 'Ingresar para continuar'} <Icon name="arrow" size={17} />
        </button>
      </div>
      <aside className="summary-card"><span className="eyebrow muted-eyebrow">RESUMEN</span><h2>{trip.origin_place_name} <Icon name="arrow" size={17} /> {trip.destination_place_name}</h2><p className="summary-date"><Icon name="calendar" size={16} />{formatDate(departureDay(trip))}</p><div className="summary-divider" /><div className="summary-company"><span className="company-avatar blue"><Icon name="bus" size={18} /></span><span><strong>{trip.company_name}</strong><small>Servicio {trip.service_code}</small></span></div><div className="summary-stops"><span><small>Subís en</small><strong>{selectedPlace(boardingStop)?.stop_name ?? '—'}</strong></span><span><small>Bajás en</small><strong>{selectedPlace(alightingStop)?.stop_name ?? '—'}</strong></span></div>{selectedSeats.length > 0 && <div className="summary-selected-seats">{selectedSeats.map((seat) => <span key={seat.cell_id}>Asiento {seat.seat_label} · {seatClassNames[seat.seat_class] ?? seat.seat_class ?? 'Estándar'} · {formatPrice(seat.price)}</span>)}</div>}<div className="summary-total"><span>Total estimado</span><strong>{selectedSeats.length === passengerCount ? formatPrice(total) : 'Elegí tus asientos'}</strong></div><small className="summary-caption">La selección no queda reservada.</small></aside>
    </div>
  </section>;
}

function CheckoutResultPage({ orderId, kind = 'ticket', onTickets, onSearch }) {
  const isPass = kind === 'pass';
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) return undefined;
    let active = true;
    let timer;
    const refresh = async () => {
      const { data, error: resultError } = await supabase.rpc(isPass ? 'pass_checkout_status' : 'passenger_checkout_status', { p_order: orderId });
      if (!active) return;
      if (resultError) {
        setError(errorText(resultError));
        return;
      }
      const next = data?.[0]?.status ?? '';
      if (!next) {
        setError('No encontramos la reserva para esta cuenta. Iniciá sesión con la cuenta usada durante la compra.');
        return;
      }
      setStatus(next);
      setError('');
      if (['approved', 'expired', 'cancelled', 'refund_required'].includes(next) && timer) {
        window.clearInterval(timer);
      }
    };
    void refresh();
    timer = window.setInterval(() => { void refresh(); }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [orderId, isPass]);

  const title = status === 'approved' ? '¡Pago de prueba aprobado!'
    : status === 'expired' ? 'La reserva venció'
      : status === 'cancelled' ? 'El pago no se completó'
        : status === 'refund_required' ? 'Estamos revisando la devolución'
          : 'Estamos verificando tu pago';
  return <section className="flow-page">
    <span className="eyebrow muted-eyebrow">ESTADO DE LA COMPRA</span>
    <h1>{title}</h1>
    {error && <Notice kind="error">{error}</Notice>}
    {status === 'approved'
      ? <Notice kind="success">Mercado Pago confirmó la operación. {isPass ? 'Tu abono ya está en “Mis pasajes”, arriba, en “Mis abonos”.' : 'Tus pasajes ya están en “Mis pasajes”.'}</Notice>
      : status === 'refund_required'
        ? <Notice kind="warning">No se emitió un pasaje. Se inició una devolución porque la reserva ya no estaba disponible.</Notice>
        : status === 'expired'
          ? <Notice kind="warning">No se confirmó el pago dentro del plazo de reserva. Volvé a buscar el viaje para intentarlo otra vez.</Notice>
          : status === 'cancelled'
            ? <Notice kind="info">La compra no quedó confirmada y no se emitió ningún pasaje.</Notice>
            : <Notice kind="info">El retorno desde Mercado Pago no confirma el pago. Esperá mientras validamos la notificación segura del servidor.</Notice>}
    <div className="account-actions">
      {status === 'approved' && <button className="button button-primary" onClick={onTickets}>{isPass ? 'Ver mi abono' : 'Ver mis pasajes'}</button>}
      <button className="button button-secondary" onClick={onSearch}>Volver a buscar</button>
    </div>
  </section>;
}

function PassesPage({ onBuy, onMine }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [placeSearch, setPlaceSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [routeKey, setRouteKey] = useState('');
  useEffect(() => {
    let active = true;
    void supabase.rpc('passenger_pass_catalog').then(({ data, error: resultError }) => {
      if (!active) return;
      setLoading(false);
      if (resultError) setError(errorText(resultError)); else setProducts(data ?? []);
    });
    return () => { active = false; };
  }, []);
  const buy = async (productId) => {
    setBusyId(productId);
    setError('');
    const message = await onBuy(productId);
    setBusyId('');
    if (message) setError(message);
  };
  // el tramo es el mismo en ambos sentidos: se agrupa por el par de localidades
  const routeOf = (product) => [product.place_a_name, product.place_b_name].sort((a, b) => a.localeCompare(b, 'es')).join(' ↔ ');
  const matchesPlace = (product) => !normalizeText(placeSearch)
    || normalizeText(`${product.place_a_name} ${product.place_b_name}`).includes(normalizeText(placeSearch));
  const placeProducts = products.filter(matchesPlace);
  const companies = [];
  for (const product of placeProducts) {
    if (!companies.some((item) => item.id === product.company_id)) {
      companies.push({ id: product.company_id, name: product.company_name, logo: product.logo_path });
    }
  }
  const visibleCompanies = companies.filter((company) => normalizeText(company.name).includes(normalizeText(companySearch)));
  const company = companyId ? companies.find((item) => item.id === companyId) ?? products.filter((p) => p.company_id === companyId).map((p) => ({ id: p.company_id, name: p.company_name, logo: p.logo_path }))[0] : null;
  const companyProducts = placeProducts.filter((product) => product.company_id === companyId);
  const routes = [];
  for (const product of companyProducts) {
    const key = routeOf(product);
    let route = routes.find((item) => item.key === key);
    if (!route) { route = { key, options: [] }; routes.push(route); }
    route.options.push(product);
  }
  const route = routes.find((item) => item.key === routeKey);
  const fromPrice = (options) => Math.min(...options.map((option) => Number(option.price) / option.trips));
  const classes = route ? [...new Set(route.options.map((option) => option.seat_class ?? ''))] : [];
  const back = () => { setError(''); if (routeKey) setRouteKey(''); else { setCompanyId(''); setPlaceSearch(''); } };
  const placeFilter = <label className="company-search">
    <Icon name="pin" size={18} />
    <input type="search" value={placeSearch} onChange={(event) => setPlaceSearch(event.target.value)} placeholder="Filtrar por origen o destino..." aria-label="Filtrar por origen o destino" />
  </label>;

  return <section className="flow-page passes-page">
    <div className="section-heading"><div><span className="eyebrow muted-eyebrow">VIAJÁ MÁS, PAGÁ MENOS</span><h1>{company ? company.name : 'Abonos'}</h1></div><button className="button button-secondary" onClick={onMine}>Mis abonos</button></div>
    {companyId && <button className="back-button" onClick={back}><Icon name="back" size={18} /> {routeKey ? `Volver a los tramos de ${company?.name ?? ''}` : 'Volver a las empresas'}</button>}
    {!companyId && <p className="muted">Elegí una empresa y el tramo que hacés seguido. Cada abono es un paquete de viajes válido en los dos sentidos y queda a nombre del DNI de tu cuenta. Después reservás cada viaje desde la búsqueda con “Usar 1 viaje del abono”.</p>}
    {error && <Notice kind="error">{error}</Notice>}
    {loading && <p className="loading-state">Cargando abonos...</p>}
    {!loading && products.length === 0 && !error && <div className="empty-state"><span>▣</span><h2>Todavía no hay abonos a la venta</h2><p>Las empresas que los habiliten aparecerán acá.</p></div>}

    {!loading && products.length > 0 && !companyId && <>
      <div className="pass-filters">
        <label className="company-search"><Icon name="search" size={18} /><input type="search" value={companySearch} onChange={(event) => setCompanySearch(event.target.value)} placeholder="Buscar empresa..." aria-label="Buscar empresa" /></label>
        {placeFilter}
      </div>
      {visibleCompanies.length === 0 && <div className="empty-search"><Icon name="bus" size={24} /><h3>No encontramos abonos con ese filtro</h3><p>Probá con otro nombre de empresa o de localidad.</p></div>}
      <div className="company-directory-grid">
        {visibleCompanies.map((item) => <article className="company-directory-card" key={item.id}>
          <button className="company-card-link" onClick={() => { setCompanyId(item.id); setRouteKey(''); }}>
            <CompanyLogo name={item.name} logoPath={item.logo} />
            <strong>{item.name}</strong>
            <span>Ver abonos <Icon name="arrow" size={15} /></span>
          </button>
        </article>)}
      </div>
    </>}

    {companyId && !routeKey && <>
      {placeFilter}
      {routes.length === 0 && <div className="empty-search"><Icon name="pin" size={24} /><h3>No hay abonos para ese origen o destino</h3><p>Probá con otra localidad.</p></div>}
      <div className="pass-route-grid">
        {routes.map((item) => <button className="pass-route-card" key={item.key} onClick={() => setRouteKey(item.key)}>
          <strong>{item.key}</strong>
          <span>{item.options.length} {item.options.length === 1 ? 'abono' : 'abonos'} · desde {formatPrice(fromPrice(item.options))} por viaje</span>
          <span className="pass-route-go">Ver abonos <Icon name="arrow" size={15} /></span>
        </button>)}
      </div>
    </>}

    {companyId && route && <div className="pass-company">
      <h2>{route.key}</h2>
      {classes.map((seatClass) => <article className="pass-route" key={seatClass || 'all'}>
        {(classes.length > 1 || seatClass) && <h3>{seatClass || 'Cualquier tipo de asiento'}</h3>}
        <div className="pass-options">{route.options.filter((option) => (option.seat_class ?? '') === seatClass).map((option) => <div className="pass-option" key={option.product_id}>
          <strong>{option.trips} viajes</strong>
          <span>{formatPrice(option.price)}</span>
          <small>{formatPrice(Number(option.price) / option.trips)} por viaje · {option.valid_days} días · {passDaysText(option.day_types, companyId)}</small>
          <button className="button button-primary" disabled={Boolean(busyId)} onClick={() => void buy(option.product_id)}>{busyId === option.product_id ? 'Abriendo...' : 'Comprar'}</button>
        </div>)}</div>
      </article>)}
    </div>}
  </section>;
}

function SeatPicker({ seats, selectedSeats, passengerCount, onToggle }) {
  const floors = [...new Set(seats.map((seat) => Number(seat.floor)))].sort((a, b) => a - b);
  const [activeFloor, setActiveFloor] = useState(floors[0] ?? 1);
  useEffect(() => { if (!floors.includes(activeFloor)) setActiveFloor(floors[0] ?? 1); }, [seats, activeFloor]);
  const floorCells = seats.filter((cell) => Number(cell.floor) === activeFloor);
  const floorSeats = floorCells.filter((cell) => cell.cell_kind === 'seat');
  const rows = [...new Set(floorCells.map((cell) => Number(cell.row_idx)))].sort((a, b) => a - b);
  const columnTemplate = seatColumnTemplate(floorCells);
  const free = seats.filter((seat) => seat.cell_kind === 'seat' && seat.available).length;
  const cellNames = { driver: 'Chofer', door: 'Puerta', stairs: 'Escalera', toilet: 'Baño', trunk: 'Baúl' };
  return <section className="seat-picker" aria-label="Elegir asientos">
    <div className="seat-picker-heading"><div><h2>Elegí tus asientos</h2><p>Seleccioná {passengerCount} {passengerCount === 1 ? 'lugar' : 'lugares'}.</p></div><span>{free} disponibles</span></div>
    {floors.length > 1 && <div className="seat-floor-tabs" role="tablist" aria-label="Piso del vehículo">{floors.map((floor) => <button type="button" key={floor} role="tab" aria-selected={floor === activeFloor} className={floor === activeFloor ? 'active' : ''} onClick={() => setActiveFloor(floor)}>Piso {floor}</button>)}</div>}
    {floorSeats.length === 0 ? <Notice kind="warning">No hay asientos publicados para este piso.</Notice> : <div className="seat-plan" role="group" aria-label={`Asientos del piso ${activeFloor}`}><div className="seat-front">Frente de la unidad</div>{rows.map((row) => <div className="seat-row live-seat-row" key={row} style={{ gridTemplateColumns: columnTemplate }}>{floorCells.filter((cell) => Number(cell.row_idx) === row).map((cell) => {
      if (cell.cell_kind !== 'seat') {
        const label = cellNames[cell.cell_kind] ?? '';
        return <span key={cell.cell_id} className={`seat-cell-placeholder seat-cell-${cell.cell_kind}`} style={{ gridColumn: Number(cell.col_idx) }} title={label} aria-hidden="true">{label}</span>;
      }
      const isSelected = selectedSeats.some((item) => item.cell_id === cell.cell_id);
      const className = String(cell.seat_class ?? '').toLocaleLowerCase('es-AR');
      const limitReached = selectedSeats.length >= passengerCount;
      return <button type="button" key={cell.cell_id} className={`seat-option ${className.includes('premium') || className.includes('cama') ? 'seat-premium' : ''} ${isSelected ? 'selected' : ''} ${cell.available ? '' : 'occupied'}`} style={{ gridColumn: Number(cell.col_idx) }} disabled={!cell.available || (!isSelected && limitReached)} aria-pressed={isSelected} aria-label={`Asiento ${cell.seat_label}, piso ${cell.floor}, ${seatClassNames[className] ?? cell.seat_class ?? 'estándar'}, ${cell.available ? 'disponible' : 'ocupado'}, ${formatPrice(cell.price)}`} title={`${seatClassNames[className] ?? cell.seat_class ?? 'Estándar'} · ${formatPrice(cell.price)}`} onClick={() => onToggle(cell)}><Icon name="seat" size={16} /><strong>{cell.seat_label}</strong>{isSelected && cell.price != null && <small className="seat-option-price">{formatPrice(cell.price)}</small>}</button>;
    })}</div>)}</div>}
    <div className="seat-legend"><span><i className="free-seat" /> Disponible</span><span><i className="chosen-seat" /> Elegido</span><span><i className="taken-seat" /> Ocupado</span></div>
    <p className="seat-selected-count" aria-live="polite">Elegidos: {selectedSeats.length} de {passengerCount}{selectedSeats.length > 0 && ` · ${formatPrice(selectedSeats.reduce((sum, seat) => sum + Number(seat.price ?? 0), 0))}`}</p>
  </section>;
}

function AuthPage({ mode, setMode, onSuccess }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', dni: '', birth_date: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const email = form.email.trim().toLowerCase();
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password: form.password })
      : await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
          data: { account_type: 'passenger', first_name: form.first_name.trim(), last_name: form.last_name.trim(), dni: form.dni.replace(/\D/g, ''), birth_date: form.birth_date }
        }
      });
    setBusy(false);
    if (result.error) { setMessage({ kind: 'error', text: errorText(result.error) }); return; }
    if (mode === 'signup' && !result.data.session) {
      setMessage({ kind: 'success', text: 'Te enviamos un correo para confirmar tu cuenta. Después vas a poder iniciar sesión.' });
      return;
    }
    onSuccess();
  };
  return <section className="account-page">
    <div className="flow-heading"><span className="eyebrow muted-eyebrow">TU CUENTA DE PASAJERO</span><h1>Todos tus viajes, en un solo lugar.</h1><p>Consultá tus pasajes y códigos QR cuando los necesites.</p></div>
    <form className="form-card account-card" onSubmit={submit}>
      <div className="account-icon"><Icon name="user" size={24} /></div>
      <div className="account-mode-switch" role="group" aria-label="Tipo de acceso"><button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setMessage(null); }}>Ingresar</button><button type="button" className={mode === 'signup' ? 'selected' : ''} onClick={() => { setMode('signup'); setMessage(null); }}>Crear cuenta</button></div>
      <h2>{mode === 'signup' ? 'Crear tu cuenta' : 'Ingresar a mi cuenta'}</h2>
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      {mode === 'signup' && <>
        <div className="form-fields"><label className="input-field"><span>Nombre</span><input autoComplete="given-name" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} minLength={2} required /></label><label className="input-field"><span>Apellido</span><input autoComplete="family-name" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} minLength={2} required /></label></div>
        <div className="form-fields"><label className="input-field"><span>DNI</span><input inputMode="numeric" autoComplete="off" value={form.dni} onChange={(event) => setForm({ ...form, dni: event.target.value.replace(/\D/g, '').slice(0, 10) })} minLength={7} maxLength={10} required /></label><label className="input-field"><span>Fecha de nacimiento</span><input type="date" max={TODAY} min="1900-01-01" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} required /></label></div>
      </>}
      <label className="input-field"><span>Correo electrónico</span><input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
      <label className="input-field"><span>Contraseña</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={8} required /></label>
      {mode === 'signup' && <label className="consent"><input type="checkbox" required /><span>Acepto el tratamiento de mis datos para administrar mi cuenta y mis viajes.</span></label>}
      <button className="button button-primary form-submit" disabled={busy}>{busy ? 'Procesando...' : mode === 'login' ? 'Ingresar' : 'Crear mi cuenta'} <Icon name="arrow" size={17} /></button>
      <div className="account-footnote"><Icon name="shield" size={15} />Tus datos se usan para asociar pasajes a tu cuenta.</div>
    </form>
  </section>;
}

function AccountPage({ session, onTickets, onLogout }) {
  const [name, setName] = useState([session.user.user_metadata.first_name, session.user.user_metadata.last_name].filter(Boolean).join(' '));
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void supabase.from('passenger_profiles').select('first_name,last_name')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error: resultError }) => {
        if (!active) return;
        if (resultError) setError(errorText(resultError));
        else if (data) setName(`${data.first_name} ${data.last_name}`);
      });
    return () => { active = false; };
  }, [session.user.id]);
  return <section className="account-card account-summary"><span className="eyebrow">MI CUENTA</span><h1>Hola{name ? `, ${name}` : ''}.</h1><p>{session.user.email}</p>{error && <Notice kind="error">{error}</Notice>}<div className="account-actions"><button className="button button-primary" onClick={onTickets}>Ver mis pasajes</button><button className="button button-secondary" onClick={onLogout}>Cerrar sesión</button></div><Notice kind="info">Tus pasajes se asocian a tu cuenta mediante DNI y correo electrónico.</Notice></section>;
}

function TicketsPage({ onTrack }) {
  const [tickets, setTickets] = useState([]);
  const [passes, setPasses] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void supabase.rpc('passenger_my_tickets').then(({ data, error: resultError }) => {
      if (!active) return;
      setLoading(false);
      if (resultError) setError(errorText(resultError));
      else setTickets(data ?? []);
    });
    void supabase.rpc('passenger_my_passes').then(({ data }) => { if (active) setPasses(data ?? []); });
    return () => { active = false; };
  }, [reloadKey]);
  return <section className="flow-page tickets-page">
    <div className="section-heading"><div><span className="eyebrow muted-eyebrow">TU HISTORIAL</span><h1>Mis pasajes</h1></div></div>
    {error && <Notice kind="error">{error}</Notice>}
    {passes.length > 0 && <div className="pass-list">
      <h2>Mis abonos</h2>
      {passes.map((pass) => <article className="pass-card" key={pass.pass_id}>
        <div><span className="eyebrow muted-eyebrow">{pass.company_name}</span><h3>{pass.place_a_name} ↔ {pass.place_b_name}{pass.seat_class ? ` · ${pass.seat_class}` : ''}</h3><small>Vale: {passDaysText(pass.day_types, pass.company_id).toLowerCase()}</small></div>
        <div className="pass-count"><strong>{pass.trips_left}</strong><span>de {pass.trips_total} viajes</span></div>
        <small>{pass.status === 'cancelled' ? 'Dado de baja' : pass.expires_at <= new Date().toISOString() ? `Venció el ${formatDate(pass.expires_at)}` : pass.trips_left === 0 ? 'Sin viajes disponibles' : `Vence el ${formatDate(pass.expires_at)}`}</small>
      </article>)}
      <p className="muted">Para usarlo, buscá un viaje de ese tramo y elegí “Usar 1 viaje del abono”.</p>
    </div>}
    {loading && <p className="loading-state">Cargando tus pasajes...</p>}
    {!loading && tickets.length === 0 && <div className="empty-state"><span>▣</span><h2>Todavía no tenés pasajes asociados</h2><p>Los pasajes comprados en boletería aparecerán acá cuando coincidan tu DNI y correo.</p><p>La compra desde esta web estará disponible cuando se active el pago online.</p></div>}
    <div className="ticket-list">{tickets.map((ticket) => <TicketCard key={ticket.ticket_id} ticket={ticket} onTrack={onTrack} onChanged={() => setReloadKey((n) => n + 1)} />)}</div>
  </section>;
}

function TicketCard({ ticket, onTrack, onChanged }) {
  const [qr, setQr] = useState('');
  const [printBusy, setPrintBusy] = useState(false);
  // imprime solo este pasaje, con los mismos datos y el mismo diseño A4 que la ventanilla
  const printThis = async () => {
    const paymentLabels = { cash: 'Efectivo', debit: 'Débito', credit: 'Crédito', transfer: 'Transferencia', mp: 'Mercado Pago', pass: 'Abono', complimentary: 'Sin cargo' };
    setPrintBusy(true);
    setCancelError('');
    try {
      await printTicketA4({
        qr_code: ticket.qr_code, seat_label: ticket.seat_label, price: ticket.price, passenger_name: ticket.passenger_name, passenger_dni: ticket.passenger_dni,
        from: ticket.from_stop, to: ticket.to_stop, receiptNumber: ticket.receipt_number ?? 0,
        salesChannel: ticket.sales_channel === 'counter' ? 'Ventanilla' : 'Web · Punto de venta',
        paymentMethod: paymentLabels[ticket.payment_method] ?? ticket.payment_method ?? '',
        issueDate: new Date(ticket.issued_at ?? ticket.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' })
      }, {
        company: ticket.company_name, service: ticket.service_code, route: ticket.route_name,
        origin: ticket.route_origin ?? '', destination: ticket.route_destination ?? '',
        date: new Date(`${departureDay(ticket)}T12:00:00`).toLocaleDateString('es-AR'), departure: formatTime(ticket.scheduled_departure)
      });
    } catch (printError) { setCancelError(errorText(printError)); }
    setPrintBusy(false);
  };
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const cancelPassTicket = async () => {
    const early = new Date(ticket.scheduled_departure).getTime() - Date.now() >= 24 * 3600 * 1000;
    const warning = early ? 'Se cancela el pasaje y el viaje vuelve a tu abono.' : 'Falta menos de 24 horas para la salida: se cancela el pasaje y el viaje no vuelve a tu abono.';
    if (!window.confirm(`${warning} ¿Cancelar?`)) return;
    setCancelBusy(true);
    setCancelError('');
    const { error } = await supabase.rpc('pass_cancel_ticket', { p_ticket: ticket.ticket_id });
    setCancelBusy(false);
    if (error) setCancelError(errorText(error)); else onChanged();
  };
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(ticket.qr_code, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (active) setQr(url); });
    return () => { active = false; };
  }, [ticket.qr_code]);
  const statusLabel = ticket.ticket_status === 'cancelled' ? 'Cancelado' : ticket.ticket_status === 'boarded' ? 'Abordado' : 'Válido';
  return <article className="ticket-card printable-ticket">
    <div className="ticket-top"><div><span className="eyebrow muted-eyebrow">{ticket.company_name} · Servicio {ticket.service_code}</span><h2>{ticket.from_stop} <span aria-hidden="true">→</span> {ticket.to_stop}</h2></div><span className={`ticket-status ${ticket.ticket_status === 'cancelled' ? 'cancelled-status' : ''}`}><span />{statusLabel}</span></div>
    <div className="ticket-route"><div><span>FECHA Y SALIDA</span><strong>{formatTime(ticket.scheduled_departure)}</strong><small>{formatDate(departureDay(ticket))}</small></div><div className="ticket-route-line"><i /><Icon name="arrow" size={19} /><i /></div><div className="ticket-destination"><span>RECORRIDO</span><strong>{ticket.route_name}</strong><small>{ticket.company_name}</small></div></div>
    <div className="ticket-stop-details"><span><small>PARADA DE ASCENSO</small><strong>{ticket.from_stop}</strong></span><span><small>PARADA DE DESCENSO</small><strong>{ticket.to_stop}</strong></span></div>
    <div className="ticket-details"><div className="qr-placeholder">{qr ? <img src={qr} alt={`Código QR del pasaje de servicio ${ticket.service_code}`} /> : <span>Generando QR…</span>}<small>Presentá este código al conductor</small></div><div className="passenger-details"><span>Pasajero</span><strong>{ticket.passenger_name}</strong><span>DNI</span><strong>{ticket.passenger_dni}</strong><span>Correo</span><strong>{ticket.passenger_email}</strong><span>Asiento</span><strong>{ticket.seat_label ?? 'Sin asignar'}</strong><span>Importe</span><strong>{formatPrice(ticket.price)}</strong></div></div>
    <div className="ticket-actions"><button className="button button-primary" disabled={ticket.ticket_status === 'cancelled' || printBusy} onClick={() => void printThis()}><Icon name="ticket" size={17} /> {printBusy ? 'Preparando...' : 'Imprimir / guardar PDF'}</button>{['scheduled', 'in_progress'].includes(ticket.trip_status) && ticket.ticket_status !== 'cancelled' && <button className="button button-secondary" onClick={() => onTrack(ticket.trip_id)}><Icon name="track" size={17} /> Seguir unidad</button>}{ticket.pass_id && ticket.trip_status === 'scheduled' && ticket.ticket_status === 'valid' && <button className="button button-secondary" disabled={cancelBusy} onClick={() => void cancelPassTicket()}>{cancelBusy ? 'Cancelando...' : 'Cancelar pasaje'}</button>}</div>
    {cancelError && <Notice kind="error">{cancelError}</Notice>}
  </article>;
}

function TrackingPage({ tripId, onBack, backLabel }) {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let active = true;
    setData(undefined);
    const refresh = async () => {
      const { data: result, error: resultError } = await supabase.rpc('trip_tracking', { p_trip: tripId });
      if (!active) return;
      if (resultError) { setError(errorText(resultError)); return; }
      setData(result ?? null);
      setError('');
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [tripId]);
  const stops = data?.stops ?? [];
  const mine = data?.my_stops ?? [];
  const delay = data?.delay_minutes;
  const stopRole = (id) => [mine.some((m) => m.from_stop_id === id) && 'Tu subida', mine.some((m) => m.to_stop_id === id) && 'Tu bajada'].filter(Boolean).join(' · ');
  const nextStop = stops.find((stop) => !stop.passed);
  const [shared, setShared] = useState('');
  const shareTrip = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('viaje', tripId);
    url.searchParams.delete('checkout');
    url.searchParams.delete('order_id');
    try {
      if (navigator.share) { await navigator.share({ title: 'Seguimiento en vivo', url: url.toString() }); return; }
      await navigator.clipboard.writeText(url.toString());
      setShared('Enlace copiado');
    } catch { setShared(url.toString()); }
    window.setTimeout(() => setShared(''), 4000);
  };
  // Las paradas se agrupan por localidad (cada grupo es su propia tarjeta).
  const stopGroups = stops.reduce((groups, stop) => {
    const last = groups[groups.length - 1];
    if (last && last.place === (stop.place_name ?? null)) last.stops.push(stop);
    else groups.push({ key: `${groups.length}-${stop.id}`, place: stop.place_name ?? null, stops: [stop] });
    return groups;
  }, []);
  return <section className="flow-page tracking-page">
    <button className="back-button" onClick={onBack}><Icon name="back" size={18} /> {backLabel}</button>
    <div className="tracking-head"><span className="eyebrow muted-eyebrow">SEGUIMIENTO EN VIVO</span></div>
    <div className="tracking-share"><button type="button" className="text-button" onClick={shareTrip}>{shared || 'Compartir este viaje'}</button></div>
    {error && <Notice kind="error">{error}</Notice>}
    {data === undefined && !error && <p className="loading-state">Cargando seguimiento...</p>}
    {data === null && <Notice kind="warning">El seguimiento de este viaje no está disponible. Si ya compraste el pasaje, ingresá a tu cuenta y abrilo desde "Mis pasajes".</Notice>}
    {data && <>
      <h1 className="tracking-route">{data.origin_place || data.origin_name} <span aria-hidden="true">→</span> {data.destination_place || data.destination_name}</h1>
      <p className="muted tracking-sub">{data.company_name} · Servicio {data.service_code} · {formatLongDate(data.scheduled_departure)} · Salida {formatTime(data.scheduled_departure)}</p>
      {data.signal
        ? <Notice kind="info">{delay == null ? 'Unidad en ruta.' : delay > 1 ? `La unidad va ${delay} min atrasada respecto del horario.` : delay < -1 ? `La unidad va ${-delay} min adelantada respecto del horario.` : 'La unidad va en hora.'}{nextStop?.eta_at ? ` Próxima parada: ${nextStop.name}, aprox. ${formatTime(nextStop.eta_at)}.` : ''}</Notice>
        : <Notice kind="warning">Todavía sin señal de la unidad. Cuando salga a ruta la vas a ver en el mapa.</Notice>}
      <TrackingMap data={data} selectedId={selected} onSelect={setSelected} />
      <h2 className="tracking-stops-title">Paradas</h2>
      <p className="muted">Tocá una parada para ver la hora aproximada de llegada.</p>
      {stopGroups.map((group) => <section className="stop-group" key={group.key}>
        {group.place && <h3 className="stop-place">{group.place}</h3>}
        <ol className="tracking-stops">{group.stops.map((stop) => {
          const open = selected === stop.id;
          const role = stopRole(stop.id);
          return (
          <li key={stop.id} className={`${stop.passed ? 'is-passed' : ''}${open ? ' is-open' : ''}`}>
          <button type="button" onClick={() => setSelected(open ? null : stop.id)} aria-expanded={open}>
            <span className="stop-dot" aria-hidden="true" /><span className="stop-name">{stop.name}{role && <small>{role}</small>}</span>
            <span className="stop-time">{stop.passed ? 'Ya pasó' : stop.eta_at ? formatTime(stop.eta_at) : ''}</span>
          </button>
          {open && <div className="stop-detail">{stop.passed ? 'La unidad ya pasó por esta parada.' : stop.eta_at ? `Llegada aproximada: ${formatTime(stop.eta_at)}${stop.scheduled_at && Math.abs(new Date(stop.eta_at) - new Date(stop.scheduled_at)) > 90000 ? ` (programada ${formatTime(stop.scheduled_at)})` : ''}` : 'Sin horario estimado para esta parada.'}</div>}
        </li>
          );
        })}</ol>
      </section>)}
    </>}
  </section>;
}

// Parada: pin rojo. Unidad: flecha que apunta al rumbo, con el numero de interno al lado.
const stopPinIcon = (selected, passed) => L.divIcon({
  className: 'stop-pin',
  html: `<svg viewBox="0 0 24 32" width="${selected ? 30 : 22}" height="${selected ? 40 : 29}" style="opacity:${passed ? 0.55 : 1}" aria-hidden="true"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.6 12 32 12 32s12-11.4 12-20.3C24 5.2 18.6 0 12 0z" fill="#d93025" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="11.5" r="4.2" fill="#fff"/></svg>`,
  iconSize: selected ? [30, 40] : [22, 29], iconAnchor: selected ? [15, 40] : [11, 29]
});
const unitIcon = (heading, label) => L.divIcon({
  className: 'unit-marker',
  html: `<div class="unit-arrow" style="transform: rotate(${Number.isFinite(heading) ? heading : 0}deg)">${Number.isFinite(heading)
    ? '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M12 2 20 21l-8-4-8 4z" fill="#12618e" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="#12618e" stroke="#fff" stroke-width="2"/></svg>'}</div>${label ? `<span class="unit-label">Interno ${String(label).replace(/[<>&"]/g, '')}</span>` : ''}`,
  iconSize: [30, 30], iconAnchor: [15, 15]
});

function TrackingMap({ data, selectedId, onSelect }) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const stopLayerRef = useRef(null);
  const fittedRef = useRef(null);
  const position = data.position;
  useEffect(() => {
    if (!elementRef.current) return undefined;
    const map = L.map(elementRef.current, { attributionControl: false }).setView([-31.7, -60.5], 11);
    L.control.attribution({ prefix: false }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    stopLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; stopLayerRef.current = null; fittedRef.current = null; };
  }, [data.trip_id]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !stopLayerRef.current) return;
    stopLayerRef.current.clearLayers();
    const points = [];
    if (data.route_path?.length) {
      L.polyline(data.route_path.map(([lat, lng]) => [lat, lng]), { color: '#12618e', weight: 5, opacity: 0.75 }).addTo(stopLayerRef.current);
      data.route_path.forEach(([lat, lng]) => points.push([lat, lng]));
    }
    data.stops.filter((stop) => stop.lat != null && stop.lng != null).forEach((stop) => {
      points.push([stop.lat, stop.lng]);
      L.marker([stop.lat, stop.lng], { icon: stopPinIcon(selectedId === stop.id, stop.passed), keyboard: false })
        .bindTooltip(stop.name, { direction: 'top', offset: [0, -26] }).on('click', () => onSelect(selectedId === stop.id ? null : stop.id)).addTo(stopLayerRef.current);
    });
    if (fittedRef.current !== data.trip_id && points.length) { map.fitBounds(points, { padding: [24, 24] }); fittedRef.current = data.trip_id; }
  }, [data.stops, data.route_path, selectedId, data.trip_id]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!position) { if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; } return; }
    const latLng = [position.latitude, position.longitude];
    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, { icon: unitIcon(position.heading, data.vehicle_label), zIndexOffset: 1000 }).addTo(map);
    } else {
      markerRef.current.setLatLng(latLng);
      markerRef.current.setIcon(unitIcon(position.heading, data.vehicle_label));
    }
  }, [position?.latitude, position?.longitude, position?.heading, data.vehicle_label, data.trip_id]);
  return <div className="live-map" ref={elementRef} role="img" aria-label="Mapa del recorrido y la ubicación de la unidad" />;
}
