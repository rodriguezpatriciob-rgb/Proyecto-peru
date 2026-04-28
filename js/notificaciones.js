// ============================================
// SISTEMA DE NOTIFICACIONES EN TIEMPO REAL - COMPLETO
// ============================================

import { db, auth } from './firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Mostrar notificación con Toastify
export function mostrarNotificacion(mensaje, tipo = 'success', duracion = 4000) {
    let backgroundColor;
    let icono;
    
    switch(tipo) {
        case 'success':
            backgroundColor = 'linear-gradient(135deg, #4CAF50, #2E7D32)';
            icono = '✅';
            break;
        case 'error':
            backgroundColor = 'linear-gradient(135deg, #f44336, #c62828)';
            icono = '❌';
            break;
        case 'warning':
            backgroundColor = 'linear-gradient(135deg, #FF9800, #E65100)';
            icono = '⚠️';
            break;
        case 'info':
            backgroundColor = 'linear-gradient(135deg, #2196F3, #0D47A1)';
            icono = 'ℹ️';
            break;
        default:
            backgroundColor = 'linear-gradient(135deg, #C9A962, #9A7B3D)';
            icono = '🍽️';
    }
    
    if (typeof Toastify !== 'undefined') {
        Toastify({
            text: `${icono} ${mensaje}`,
            duration: duracion,
            gravity: "top",
            position: "right",
            style: {
                background: backgroundColor,
                borderRadius: "12px",
                fontFamily: "'Poppins', sans-serif",
                fontSize: "14px",
                padding: "12px 20px",
                boxShadow: "0 4px 15px rgba(0,0,0,0.2)"
            }
        }).showToast();
    } else {
        console.log(`🔔 [${tipo}] ${mensaje}`);
    }
}

// Escuchar nuevas reservas (ADMIN)
export function escucharNuevasReservas(callback) {
    const reservasRef = collection(db, "reservas");
    const q = query(reservasRef, orderBy("fechaCreacion", "desc"), limit(10));
    
    return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const reserva = { id: change.doc.id, ...change.doc.data() };
                if (!reserva._notificado) {
                    callback(reserva);
                    updateDoc(doc(db, "reservas", change.doc.id), { _notificado: true }).catch(e => console.log(e));
                }
            }
        });
    });
}

// Escuchar nuevos pedidos (ADMIN)
export function escucharNuevosPedidos(callback) {
    const pedidosRef = collection(db, "pedidos");
    const q = query(pedidosRef, orderBy("fechaCreacion", "desc"), limit(10));
    
    return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const pedido = { id: change.doc.id, ...change.doc.data() };
                if (!pedido._notificado) {
                    callback(pedido);
                    updateDoc(doc(db, "pedidos", change.doc.id), { _notificado: true }).catch(e => console.log(e));
                }
            }
        });
    });
}

// Escuchar cambios en mis pedidos (CLIENTE)
export function escucharMiPedido(userId, callback) {
    const pedidosRef = collection(db, "pedidos");
    const q = query(pedidosRef, where("userId", "==", userId));
    
    return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "modified") {
                const pedido = { id: change.doc.id, ...change.doc.data() };
                callback(pedido);
            }
        });
    });
}

// Escuchar cambios en mis reservas (CLIENTE)
export function escucharMiReserva(userId, callback) {
    const reservasRef = collection(db, "reservas");
    const q = query(reservasRef, where("userId", "==", userId));
    
    return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "modified") {
                const reserva = { id: change.doc.id, ...change.doc.data() };
                callback(reserva);
            }
        });
    });
}

// Actualizar estado del pedido
export async function actualizarEstadoPedido(pedidoId, estado, tiempoEstimado = null) {
    try {
        const updates = { estado: estado };
        if (tiempoEstimado) {
            updates.tiempoEstimado = tiempoEstimado;
            updates.tiempoRestante = tiempoEstimado;
            updates.tiempoInicio = new Date();
        }
        if (estado === 'listo') {
            updates.tiempoListo = new Date();
        }
        await updateDoc(doc(db, "pedidos", pedidoId), updates);
        return true;
    } catch (error) {
        console.error("Error:", error);
        return false;
    }
}

// Actualizar estado de reserva
export async function actualizarEstadoReserva(reservaId, estado) {
    try {
        await updateDoc(doc(db, "reservas", reservaId), { estado: estado });
        return true;
    } catch (error) {
        console.error("Error:", error);
        return false;
    }
}

// Inicializar notificaciones para ADMIN
export function inicializarNotificacionesAdmin() {
    let audio = null;
    try {
        audio = new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3');
        audio.volume = 0.3;
    } catch(e) {}
    
    escucharNuevasReservas((reserva) => {
        mostrarNotificacion(
            `📅 Nueva reserva de ${reserva.userNombre || 'Cliente'} para ${reserva.personas || '?'} personas - ${reserva.hora || 'horario no especificado'}`,
            'info', 6000
        );
        if (audio) audio.play().catch(e => console.log(e));
    });
    
    escucharNuevosPedidos((pedido) => {
        const totalItems = pedido.items?.reduce((sum, i) => sum + (i.cantidad || 1), 0) || 0;
        mostrarNotificacion(
            `🍽️ ¡NUEVO PEDIDO! ${pedido.userEmail || 'Cliente'} - ${totalItems} items - $${pedido.total?.toFixed(2) || '0'} MXN`,
            'info', 6000
        );
        if (audio) audio.play().catch(e => console.log(e));
    });
}

// Inicializar notificaciones para CLIENTE
export function inicializarNotificacionesCliente() {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    
    escucharMiPedido(userId, (pedido) => {
        if (pedido.estado === 'preparando') {
            mostrarNotificacion(
                `👨‍🍳 Tu pedido está en preparación. Tiempo estimado: ${pedido.tiempoEstimado || 15} minutos`,
                'info', 5000
            );
        } else if (pedido.estado === 'listo') {
            mostrarNotificacion(`✅ ¡Tu pedido está listo para servir!`, 'success', 6000);
        }
    });
    
    escucharMiReserva(userId, (reserva) => {
        if (reserva.estado === 'lista') {
            mostrarNotificacion(`🎉 ¡Tu mesa está lista! Por favor acércate al host.`, 'success', 6000);
        }
    });
}

console.log("🔔 Sistema de notificaciones cargado");