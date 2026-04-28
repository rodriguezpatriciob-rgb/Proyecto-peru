// ============================================
// ADMIN.JS - PANEL DE ADMINISTRACIÓN CORREGIDO
// ============================================

import { auth, db, actualizarEstadoMesa, signOut } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { 
    collection, doc, updateDoc, deleteDoc, onSnapshot, getDocs,
    query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

let unsubscribeReservas = null;
let unsubscribePedidos = null;
let unsubscribeMesas = null;

// ============================================
// VERIFICAR AUTENTICACIÓN Y ROL
// ============================================
onAuthStateChanged(auth, async (user) => {
    console.log("👤 Verificando usuario admin:", user?.email);
    
    if (!user) {
        console.log("❌ No hay usuario, redirigiendo a login");
        window.location.href = 'login.html';
        return;
    }
    
    try {
        let esAdmin = false;
        const usuariosSnapshot = await getDocs(collection(db, "usuarios"));
        
        usuariosSnapshot.forEach(doc => {
            const data = doc.data();
            if ((doc.id === user.uid || data.email === user.email) && data.rol === 'admin') {
                esAdmin = true;
                console.log("✅ Admin encontrado:", data.email);
            }
        });
        
        console.log("🔍 ¿Es administrador?", esAdmin);
        
        if (!esAdmin) {
            alert('No tienes permisos de administrador');
            window.location.href = 'index.html';
            return;
        }
        
        console.log("✅ Acceso concedido como administrador");
        inicializarAdmin();
        
    } catch (error) {
        console.error("❌ Error verificando rol:", error);
        alert("Error de permisos. Contacta al soporte.");
        window.location.href = 'index.html';
    }
});

// ============================================
// INICIALIZAR PANEL
// ============================================
function inicializarAdmin() {
    console.log("🚀 Inicializando panel de administración...");
    cargarEstadisticas();
    cargarReservas();
    cargarPedidos();
    cargarMesas();
    cargarRankingPuntos();
    inicializarTabs();
    inicializarLogout();
}

// ============================================
// INICIALIZAR TABS
// ============================================
function inicializarTabs() {
    const tabs = document.querySelectorAll('.admin-tab');
    const sections = document.querySelectorAll('.admin-section');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            sections.forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(`tab-${target}`);
            if (targetSection) targetSection.classList.add('active');
        });
    });
}

// ============================================
// CERRAR SESIÓN
// ============================================
function inicializarLogout() {
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            signOut(auth).then(() => window.location.href = 'index.html');
        });
    }
}

// ============================================
// CARGAR ESTADÍSTICAS
// ============================================
async function cargarEstadisticas() {
    try {
        const usuariosSnapshot = await getDocs(collection(db, "usuarios"));
        const statClientes = document.getElementById('statClientes');
        if (statClientes) statClientes.textContent = usuariosSnapshot.size;
        console.log("📊 Clientes registrados:", usuariosSnapshot.size);
    } catch (error) {
        console.error("Error cargando estadísticas:", error);
    }
}

// ============================================
// CARGAR RESERVAS
// ============================================
function cargarReservas() {
    if (unsubscribeReservas) unsubscribeReservas();
    
    const reservasRef = collection(db, "reservas");
    const q = query(reservasRef, orderBy("fechaCreacion", "desc"));
    
    unsubscribeReservas = onSnapshot(q, (snapshot) => {
        console.log("📅 Snapshot de reservas recibido, tamaño:", snapshot.size);
        
        const tbody = document.querySelector('#tablaReservas tbody');
        if (!tbody) return;
        
        const reservas = [];
        snapshot.forEach((doc) => {
            reservas.push({ id: doc.id, ...doc.data() });
        });
        
        const hoy = new Date().toISOString().split('T')[0];
        const reservasHoy = reservas.filter(r => r.fecha === hoy);
        
        const statReservas = document.getElementById('statReservas');
        if (statReservas) statReservas.textContent = reservasHoy.length;
        
        if (reservas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No hay reservas registradas</td></tr>';
            return;
        }
        
        tbody.innerHTML = reservas.map(reserva => `
            <tr>
                <td>${reserva.userNombre || reserva.userEmail || 'Anónimo'}</td>
                <td>${reserva.mesaId || '-'} (${reserva.area || '-'})</td>
                <td>${formatearFecha(reserva.fecha)}</td>
                <td>${reserva.hora || '-'}</td>
                <td>${reserva.personas || '-'}</td>
                <td><span class="estado-badge ${reserva.estado || 'pendiente'}">${reserva.estado || 'pendiente'}</span></td>
                <td>
                    ${reserva.estado !== 'completada' ? `<button class="btn-action btn-confirm" onclick="window.actualizarEstadoReserva('${reserva.id}', 'completada')">✓ Completar</button>` : ''}
                    <button class="btn-action btn-cancel" onclick="window.cancelarReserva('${reserva.id}')">✗ Cancelar</button>
                </td>
            </tr>
        `).join('');
        
        console.log("📅 Reservas cargadas:", reservas.length);
    }, (error) => {
        console.error("❌ Error en onSnapshot reservas:", error);
    });
}

// ============================================
// CARGAR PEDIDOS
// ============================================
function cargarPedidos() {
    if (unsubscribePedidos) unsubscribePedidos();
    
    const pedidosRef = collection(db, "pedidos");
    const q = query(pedidosRef, orderBy("fechaCreacion", "desc"));
    
    unsubscribePedidos = onSnapshot(q, (snapshot) => {
        console.log("🍽️ Snapshot de pedidos recibido, tamaño:", snapshot.size);
        
        const tbody = document.querySelector('#tablaPedidos tbody');
        if (!tbody) return;
        
        const pedidos = [];
        snapshot.forEach((doc) => {
            pedidos.push({ id: doc.id, ...doc.data() });
        });
        
        const pedidosPendientes = pedidos.filter(p => p.estado === 'pendiente' || p.estado === 'preparando');
        
        const statPedidos = document.getElementById('statPedidos');
        if (statPedidos) statPedidos.textContent = pedidosPendientes.length;
        
        if (pedidos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No hay pedidos registrados</td></tr>';
            return;
        }
        
        tbody.innerHTML = pedidos.map(pedido => `
            <tr>
                <td>${pedido.userEmail || 'Anónimo'}</td>
                <td>${pedido.items ? pedido.items.map(i => `${i.nombre} x${i.cantidad}`).join(', ') : '-'}</td>
                <td><strong>$${pedido.total?.toFixed(2) || '0'} MXN</strong></td>
                <td>${formatearFechaHora(pedido.fechaCreacion)}</td>
                <td><span class="estado-badge ${pedido.estado === 'pendiente' ? 'pendiente' : pedido.estado === 'preparando' ? 'preparando' : 'completado'}">${pedido.estado || 'pendiente'}</span></td>
                <td>${pedido.estado === 'pendiente' ? `<button class="btn-action btn-cancel" onclick="window.cancelarPedido('${pedido.id}')">✗ Cancelar</button>` : '✓ Completado'}</td>
            </tr>
        `).join('');
        
        console.log("🍽️ Pedidos cargados:", pedidos.length);
    }, (error) => {
        console.error("❌ Error en onSnapshot pedidos:", error);
    });
}

// ============================================
// CARGAR MESAS
// ============================================
function cargarMesas() {
    if (unsubscribeMesas) unsubscribeMesas();
    
    const mesasDefinicion = [
        { id: 'M1', cap: 2, area: 'Salón Principal' }, { id: 'M2', cap: 2, area: 'Salón Principal' },
        { id: 'M3', cap: 4, area: 'Salón Principal' }, { id: 'M4', cap: 4, area: 'Salón Principal' },
        { id: 'M5', cap: 6, area: 'Salón Principal' }, { id: 'M6', cap: 6, area: 'Salón Principal' },
        { id: 'M7', cap: 8, area: 'Salón Principal' }, { id: 'M8', cap: 8, area: 'Salón Principal' },
        { id: 'T1', cap: 2, area: 'Terraza' }, { id: 'T2', cap: 2, area: 'Terraza' },
        { id: 'T3', cap: 4, area: 'Terraza' }, { id: 'T4', cap: 4, area: 'Terraza' },
        { id: 'T5', cap: 6, area: 'Terraza' }, { id: 'T6', cap: 6, area: 'Terraza' },
        { id: 'V1', cap: 2, area: 'VIP' }, { id: 'V2', cap: 4, area: 'VIP' },
        { id: 'V3', cap: 6, area: 'VIP' }, { id: 'V4', cap: 8, area: 'VIP' },
        { id: 'B1', cap: 2, area: 'Bar' }, { id: 'B2', cap: 2, area: 'Bar' },
        { id: 'B3', cap: 4, area: 'Bar' }, { id: 'B4', cap: 4, area: 'Bar' }
    ];
    
    const mesasRef = collection(db, "mesas");
    
    unsubscribeMesas = onSnapshot(mesasRef, (snapshot) => {
        console.log("🪑 Snapshot de mesas recibido, tamaño:", snapshot.size);
        
        const container = document.getElementById('mesasAdminGrid');
        if (!container) return;
        
        const mesasState = {};
        snapshot.forEach((doc) => {
            mesasState[doc.id] = doc.data();
        });
        
        let ocupadas = 0;
        const mesasHTML = mesasDefinicion.map(mesa => {
            const estado = mesasState[mesa.id]?.estado || 'disponible';
            if (estado === 'ocupada') ocupadas++;
            return `
                <div class="mesa-admin-card ${estado}">
                    <h4>${mesa.id}</h4>
                    <p class="mesa-status">${estado === 'ocupada' ? '🔴 OCUPADA' : '🟢 DISPONIBLE'}</p>
                    <p>📍 ${mesa.area}</p>
                    <p>👥 ${mesa.cap} personas</p>
                    ${estado === 'ocupada' ? `<button class="btn-action btn-confirm" onclick="window.liberarMesa('${mesa.id}')">🔓 Liberar Mesa</button>` : ''}
                </div>
            `;
        }).join('');
        
        container.innerHTML = mesasHTML;
        
        const statMesas = document.getElementById('statMesas');
        if (statMesas) statMesas.textContent = ocupadas;
        
        console.log("🪑 Mesas cargadas, ocupadas:", ocupadas);
    }, (error) => {
        console.error("❌ Error en onSnapshot mesas:", error);
        const container = document.getElementById('mesasAdminGrid');
        if (container) container.innerHTML = '<div style="text-align: center; color: red;">Error al cargar mesas</div>';
    });
}

// ============================================
// CARGAR RANKING DE PUNTOS
// ============================================
async function cargarRankingPuntos() {
    try {
        console.log("📊 Cargando ranking de puntos...");
        const puntosSnapshot = await getDocs(collection(db, "puntos"));
        const usuariosSnapshot = await getDocs(collection(db, "usuarios"));
        
        const usuariosMap = new Map();
        usuariosSnapshot.forEach(doc => usuariosMap.set(doc.id, doc.data()));
        
        const ranking = [];
        puntosSnapshot.forEach(doc => {
            const data = doc.data();
            const usuario = usuariosMap.get(doc.id);
            ranking.push({
                nombre: usuario?.nombre || usuario?.email || doc.id,
                puntos: data.puntos || 0,
                puntosAcumulados: data.puntosAcumulados || data.puntos || 0,
                puntosCanjeados: data.puntosCanjeados || 0,
                totalGastado: data.totalGastado || 0
            });
        });
        
        ranking.sort((a, b) => b.puntos - a.puntos);
        
        const tbody = document.querySelector('#tablaPuntos tbody');
        if (!tbody) return;
        
        if (ranking.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No hay datos de puntos</td></tr>';
            return;
        }
        
        tbody.innerHTML = ranking.map((user, index) => `
            <tr>
                <td>${index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : `${index + 1}. `}${user.nombre}</td>
                <td><span class="estado-badge" style="background: #C9A962; color: #0D0D0D;">⭐ ${user.puntos}</span></td>
                <td>${user.puntosAcumulados}</td>
                <td>${user.puntosCanjeados}</td>
                <td>$${user.totalGastado?.toFixed(2) || '0'} MXN</td>
            </tr>
        `).join('');
        
        console.log("📊 Ranking cargado:", ranking.length, "usuarios");
    } catch (error) {
        console.error("Error cargando ranking:", error);
    }
}

// ============================================
// FUNCIONES GLOBALES
// ============================================

window.actualizarEstadoReserva = async function(id, estado) {
    try {
        await updateDoc(doc(db, "reservas", id), { estado: estado });
        mostrarNotificacion('✅ Reserva actualizada', 'success');
    } catch (error) {
        console.error('Error:', error);
        mostrarNotificacion('❌ Error', 'error');
    }
};

window.cancelarReserva = async function(id) {
    if (confirm('¿Cancelar esta reserva?')) {
        try {
            await deleteDoc(doc(db, "reservas", id));
            mostrarNotificacion('✅ Reserva cancelada', 'success');
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('❌ Error', 'error');
        }
    }
};

window.cancelarPedido = async function(id) {
    if (confirm('¿Cancelar este pedido?')) {
        try {
            await deleteDoc(doc(db, "pedidos", id));
            mostrarNotificacion('✅ Pedido cancelado', 'success');
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('❌ Error', 'error');
        }
    }
};

window.liberarMesa = async function(mesaId) {
    if (confirm(`¿Liberar mesa ${mesaId}?`)) {
        try {
            await actualizarEstadoMesa(mesaId, 'disponible', null);
            mostrarNotificacion(`✅ Mesa ${mesaId} liberada`, 'success');
        } catch (error) {
            console.error('Error:', error);
            mostrarNotificacion('❌ Error', 'error');
        }
    }
};

// ============================================
// UTILIDADES
// ============================================

function formatearFecha(fechaStr) {
    if (!fechaStr) return '-';
    try {
        return new Date(fechaStr).toLocaleDateString('es-MX');
    } catch { return fechaStr; }
}

function formatearFechaHora(timestamp) {
    if (!timestamp) return '-';
    try {
        const fecha = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return fecha.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return '-'; }
}

function mostrarNotificacion(mensaje, tipo) {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: ${tipo === 'success' ? '#4CAF50' : '#f44336'};
        color: white; padding: 12px 24px; border-radius: 8px;
        z-index: 9999; animation: slideIn 0.3s ease;
        font-family: 'Poppins', sans-serif;
    `;
    notif.textContent = mensaje;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

console.log("🌟 Admin.js cargado correctamente");