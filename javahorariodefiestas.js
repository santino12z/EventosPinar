// Función para convertir la hora en formato HH:mm a un objeto Date con fecha base (por ejemplo, hoy)
function convertirHoraAHoraFecha(hora) {
    const fecha = new Date();
    const [horas, minutos] = hora.split(':').map(num => parseInt(num));
    fecha.setHours(horas);
    fecha.setMinutes(minutos);
    fecha.setSeconds(0);
    fecha.setMilliseconds(0);
    return fecha;
}

// Validar hora de inicio
const horarioInicio = document.getElementById('horarioInicio').value;
if (horarioInicio === '') {
    document.getElementById('horarioInicioError').textContent = 'La hora de inicio es requerida';
    isValid = false;
}

// Validar hora de finalización
const horarioFin = document.getElementById('horarioFin').value;
if (horarioFin === '') {
    document.getElementById('horarioFinError').textContent = 'La hora de finalización es requerida';
    isValid = false;
} else {
    const inicioDate = convertirHoraAHoraFecha(horarioInicio);
    const finDate = convertirHoraAHoraFecha(horarioFin);
    
    // Si la hora de finalización es antes de la hora de inicio, considera que es al día siguiente
    if (finDate <= inicioDate) {
        finDate.setDate(finDate.getDate() + 1); // Incrementa el día de la fecha de finalización
    }
    
    // Compara las horas
    if (inicioDate >= finDate) {
        document.getElementById('horarioFinError').textContent = 'La hora de finalización debe ser posterior a la hora de inicio';
        isValid = false;
    }
}
