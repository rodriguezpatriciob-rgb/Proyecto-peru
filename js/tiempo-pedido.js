// ============================================
// SISTEMA DE TIEMPO ESTIMADO PARA PEDIDOS - COMPLETO
// ============================================

import { db } from './firebase-config.js';
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { mostrarNotificacion, actualizarEstadoPedido } from './notificaciones.js';

// Tiempos base por tipo de pedido (en minutos)
const TIEMPOS_BASE = {
    'ceviche': 12,
    'tiradito': 10,
    'lomo': 20,
    'aji': 15,
    'seco': 25,
    'arroz': 15,
    'tacu': 20,
    'parihuela': 20,
    'anticuchos': 15,
    'pisco': 3,
    'chicha': 2,
    'cerveza': 2,
    'suspiro': 5,
    'mazamorra': 5,
    'picarones': 8,
    'torta': 10,
    'helado': 3,
    'default': 15
};

// Calcular tiempo estimado basado en los items del pedido
export function calcularTiempoEstimado(items) {
    if (!items || items.length === 0) return TIEMPOS_BASE.default;
    
    let tiempoTotal = 0;
    let platosFuertes = 0;
    
    for (const item of items) {
        const nombre = item.nombre.toLowerCase();
        const cantidad = item.cantidad || 1;
        
        let tiempoItem = TIEMPOS_BASE.default;
        
        if (nombre.includes('ceviche')) {
            tiempoItem = TIEMPOS_BASE.ceviche;
            platosFuertes++;
        } else if (nombre.includes('tiradito')) {
            tiempoItem = TIEMPOS_BASE.tiradito;
            platosFuertes++;
        } else if (nombre.includes('lomo')) {
            tiempoItem = TIEMPOS_BASE.lomo;
            platosFuertes++;
        } else if (nombre.includes('aji')) {
            tiempoItem = TIEMPOS_BASE.aji;
            platosFuertes++;
        } else if (nombre.includes('seco')) {
            tiempoItem = TIEMPOS_BASE.seco;
            platosFuertes++;
        } else if (nombre.includes('arroz') && !nombre.includes('leche')) {
            tiempoItem = TIEMPOS_BASE.arroz;
            platosFuertes++;
        } else if (nombre.includes('tacu')) {
            tiempoItem = TIEMPOS_BASE.tacu;
            platosFuertes++;
        } else if (nombre.includes('parihuela')) {
            tiempoItem = TIEMPOS_BASE.parihuela;
            platosFuertes++;
        } else if (nombre.includes('anticuchos')) {
            tiempoItem = TIEMPOS_BASE.anticuchos;
            platosFuertes++;
        } else if (nombre.includes('pisco') || nombre.includes('sour')) {
            tiempoItem = TIEMPOS_BASE.pisco;
        } else if (nombre.includes('chicha') || nombre.includes('inca') || nombre.includes('emoliente')) {
            tiempoItem = TIEMPOS_BASE.chicha;
        } else if (nombre.includes('cerveza') || nombre.includes('cusqueña')) {
            tiempoItem = TIEMPOS_BASE.cerveza;
        } else if (nombre.includes('suspiro')) {
            tiempoItem = TIEMPOS_BASE.suspiro;
        } else if (nombre.includes('mazamorra')) {
            tiempoItem = TIEMPOS_BASE.mazamorra;
        } else if (nombre.includes('picarones')) {
            tiempoItem = TIEMPOS_BASE.picarones;
        } else if (nombre.includes('torta')) {
            tiempoItem = TIEMPOS_BASE.torta;
        } else if (nombre.includes('helado')) {
            tiempoItem = TIEMPOS_BASE.helado;
        }
        
        tiempoTotal += tiempoItem * cantidad;
    }
    
    // Si hay múltiples platos fuertes, sumar tiempo extra
    if (platosFuertes > 1) {
        tiempoTotal += (platosFuertes - 1) * 5;
    }
    
    // Tiempo mínimo 10 minutos, máximo 60
    return Math.min(Math.max(Math.ceil(tiempoTotal), 10), 60);
}

// Iniciar preparación de un pedido con tiempo estimado
export async function iniciarPreparacion(pedidoId, tiempoEstimado = null) {
    try {
        const pedidoRef = doc(db, "pedidos", pedidoId);
        const pedidoDoc = await getDoc(pedidoRef);
        
        if (!pedidoDoc.exists()) {
            throw new Error("Pedido no encontrado");
        }
        
        const pedido = pedidoDoc.data();
        
        if (!tiempoEstimado) {
            tiempoEstimado = calcularTiempoEstimado(pedido.items);
        }
        
        await actualizarEstadoPedido(pedidoId, 'preparando', tiempoEstimado);
        
        mostrarNotificacion(`⏱️ Pedido en preparación. Tiempo estimado: ${tiempoEstimado} minutos`, 'info');
        
        return { success: true, tiempoEstimado };
    } catch (error) {
        console.error("Error iniciando preparación:", error);
        mostrarNotificacion("Error al iniciar la preparación", 'error');
        return { success: false, error: error.message };
    }
}

// Marcar pedido como listo
export async function marcarPedidoListo(pedidoId) {
    try {
        await actualizarEstadoPedido(pedidoId, 'listo');
        mostrarNotificacion(`✅ ¡Pedido listo para servir!`, 'success');
        return { success: true };
    } catch (error) {
        console.error("Error marcando pedido como listo:", error);
        return { success: false };
    }
}

// Renderizar selector de tiempo para admin
export function renderizarSelectorTiempo(pedidoId, tiempoActual = 15) {
    return `
        <div class="tiempo-selector" style="display: inline-flex; gap: 5px; align-items: center; flex-wrap: wrap;">
            <select id="tiempo_${pedidoId}" style="padding: 5px 10px; border-radius: 8px; border: 1px solid #C9A962; background: white; font-family: 'Poppins', sans-serif; cursor: pointer;">
                <option value="10" ${tiempoActual === 10 ? 'selected' : ''}>10 min</option>
                <option value="15" ${tiempoActual === 15 ? 'selected' : ''}>15 min</option>
                <option value="20" ${tiempoActual === 20 ? 'selected' : ''}>20 min</option>
                <option value="25" ${tiempoActual === 25 ? 'selected' : ''}>25 min</option>
                <option value="30" ${tiempoActual === 30 ? 'selected' : ''}>30 min</option>
                <option value="45" ${tiempoActual === 45 ? 'selected' : ''}>45 min</option>
                <option value="60" ${tiempoActual === 60 ? 'selected' : ''}>60 min</option>
            </select>
            <button onclick="window.iniciarPreparacionPedido('${pedidoId}')" class="btn-action btn-confirm" style="padding: 5px 12px;">
                ▶️ Iniciar
            </button>
        </div>
    `;
}

// Renderizar estado del pedido para admin
export function renderizarEstadoPedidoAdmin(pedido) {
    if (!pedido) return '-';
    
    if (pedido.estado === 'pendiente') {
        return renderizarSelectorTiempo(pedido.id);
    } else if (pedido.estado === 'preparando') {
        const tiempoRestante = pedido.tiempoRestante || pedido.tiempoEstimado || 15;
        const tiempoEstimado = pedido.tiempoEstimado || 15;
        const porcentaje = ((tiempoEstimado - tiempoRestante) / tiempoEstimado) * 100;
        
        return `
            <div style="min-width: 140px;">
                <div style="background: #e0e0e0; border-radius: 10px; height: 6px; margin-bottom: 8px; overflow: hidden;">
                    <div style="width: ${Math.max(0, Math.min(100, porcentaje))}%; background: #C9A962; height: 100%; border-radius: 10px; transition: width 0.5s ease;"></div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span style="font-size: 0.7rem;">⏱️ ${tiempoRestante} min restantes</span>
                    <button onclick="window.marcarPedidoListo('${pedido.id}')" class="btn-action btn-confirm" style="padding: 3px 10px;">
                        ✅ Listo
                    </button>
                </div>
            </div>
        `;
    } else if (pedido.estado === 'listo') {
        return '<span class="estado-badge completado" style="background: #4CAF50;">✅ Listo para servir</span>';
    } else if (pedido.estado === 'cancelado') {
        return '<span class="estado-badge cancelado" style="background: #9E9E9E;">❌ Cancelado</span>';
    }
    return '-';
}

// Funciones globales para usar desde onclick
window.iniciarPreparacionPedido = async function(pedidoId) {
    const select = document.getElementById(`tiempo_${pedidoId}`);
    const tiempo = select ? parseInt(select.value) : 15;
    await iniciarPreparacion(pedidoId, tiempo);
};

window.marcarPedidoListo = async function(pedidoId) {
    await marcarPedidoListo(pedidoId);
};

console.log("⏱️ Sistema de tiempo de pedidos cargado correctamente");