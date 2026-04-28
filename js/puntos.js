// ============================================
// SISTEMA DE PUNTOS DE LEALTAD - CORREGIDO CON MANEJO DE ERRORES
// ============================================

import { db, auth } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Configuración de puntos
const PUNTOS_POR_GASTO = 100;
const PUNTOS_POR_DESCUENTO = 10;
const DESCUENTO_PORCENTAJE = 10;

// ============================================
// OBTENER PUNTOS DE UN USUARIO (CON FALLBACK LOCAL)
// ============================================
export async function obtenerPuntos(userId) {
    try {
        console.log(`🔍 Obteniendo puntos para usuario: ${userId}`);
        const puntosRef = doc(db, "puntos", userId);
        const puntosDoc = await getDoc(puntosRef);
        
        if (puntosDoc.exists()) {
            console.log(`✅ Puntos encontrados: ${puntosDoc.data().puntos || 0}`);
            return puntosDoc.data();
        } else {
            // Crear nuevo registro si no existe
            const nuevoRegistro = {
                puntos: 0,
                totalGastado: 0,
                puntosAcumulados: 0,
                puntosCanjeados: 0,
                historial: [],
                ultimaActualizacion: new Date()
            };
            try {
                await setDoc(puntosRef, nuevoRegistro);
                console.log("📝 Nuevo registro de puntos creado");
            } catch (setError) {
                console.warn("No se pudo crear en Firebase, usando local:", setError);
                // Guardar en localStorage como fallback
                localStorage.setItem(`puntos_${userId}`, JSON.stringify(nuevoRegistro));
            }
            return nuevoRegistro;
        }
    } catch (error) {
        console.warn("⚠️ Error obteniendo puntos de Firebase, usando localStorage:", error.message);
        
        // Fallback a localStorage
        const localPuntos = localStorage.getItem(`puntos_${userId}`);
        if (localPuntos) {
            return JSON.parse(localPuntos);
        }
        
        return { puntos: 0, totalGastado: 0, puntosAcumulados: 0, puntosCanjeados: 0, historial: [] };
    }
}

// ============================================
// CALCULAR PUNTOS POR COMPRA
// ============================================
export function calcularPuntos(montoTotal) {
    const puntos = Math.floor(montoTotal / PUNTOS_POR_GASTO);
    return puntos;
}

// ============================================
// AGREGAR PUNTOS POR COMPRA
// ============================================
export async function agregarPuntos(userId, montoTotal, pedidoId, items = []) {
    try {
        const puntosGanados = calcularPuntos(montoTotal);
        
        if (puntosGanados === 0) return 0;
        
        console.log(`⭐ Agregando ${puntosGanados} puntos al usuario ${userId}`);
        
        const puntosRef = doc(db, "puntos", userId);
        
        try {
            const puntosDoc = await getDoc(puntosRef);
            
            let puntosActuales = 0;
            let puntosAcumulados = 0;
            let totalGastado = 0;
            let historial = [];
            
            if (puntosDoc.exists()) {
                const data = puntosDoc.data();
                puntosActuales = data.puntos || 0;
                puntosAcumulados = data.puntosAcumulados || 0;
                totalGastado = data.totalGastado || 0;
                historial = data.historial || [];
            }
            
            const nuevaEntrada = {
                fecha: new Date(),
                monto: montoTotal,
                puntosGanados: puntosGanados,
                pedidoId: pedidoId,
                tipo: 'compra'
            };
            
            historial.unshift(nuevaEntrada);
            
            await setDoc(puntosRef, {
                puntos: puntosActuales + puntosGanados,
                puntosAcumulados: puntosAcumulados + puntosGanados,
                totalGastado: totalGastado + montoTotal,
                ultimaActualizacion: new Date(),
                historial: historial
            }, { merge: true });
            
        } catch (firestoreError) {
            console.warn("⚠️ Error en Firestore, guardando en localStorage:", firestoreError.message);
            
            // Fallback a localStorage
            const localKey = `puntos_${userId}`;
            let localData = localStorage.getItem(localKey);
            let puntosData = localData ? JSON.parse(localData) : { puntos: 0, totalGastado: 0, puntosAcumulados: 0, puntosCanjeados: 0, historial: [] };
            
            puntosData.puntos = (puntosData.puntos || 0) + puntosGanados;
            puntosData.puntosAcumulados = (puntosData.puntosAcumulados || 0) + puntosGanados;
            puntosData.totalGastado = (puntosData.totalGastado || 0) + montoTotal;
            puntosData.historial = puntosData.historial || [];
            puntosData.historial.unshift({
                fecha: new Date(),
                monto: montoTotal,
                puntosGanados: puntosGanados,
                pedidoId: pedidoId,
                tipo: 'compra'
            });
            
            localStorage.setItem(localKey, JSON.stringify(puntosData));
        }
        
        return puntosGanados;
        
    } catch (error) {
        console.error("❌ Error agregando puntos:", error);
        return 0;
    }
}

// ============================================
// CANJEAR PUNTOS POR DESCUENTO
// ============================================
export async function canjearPuntos(userId, puntosUsar = PUNTOS_POR_DESCUENTO) {
    try {
        const puntosData = await obtenerPuntos(userId);
        const puntosActuales = puntosData.puntos || 0;
        
        if (puntosActuales < puntosUsar) {
            return { 
                success: false, 
                mensaje: `Puntos insuficientes. Tienes ${puntosActuales} puntos, necesitas ${puntosUsar}`
            };
        }
        
        const nuevoSaldo = puntosActuales - puntosUsar;
        const puntosCanjeados = (puntosData.puntosCanjeados || 0) + puntosUsar;
        
        let historialActual = puntosData.historial || [];
        historialActual.unshift({
            fecha: new Date(),
            puntosUsados: puntosUsar,
            tipo: 'canje',
            descuento: DESCUENTO_PORCENTAJE
        });
        
        // Intentar guardar en Firestore
        try {
            const puntosRef = doc(db, "puntos", userId);
            await updateDoc(puntosRef, {
                puntos: nuevoSaldo,
                puntosCanjeados: puntosCanjeados,
                historial: historialActual,
                ultimoCanje: new Date()
            });
        } catch (firestoreError) {
            console.warn("⚠️ Error actualizando Firestore, guardando en localStorage:", firestoreError.message);
            
            // Fallback a localStorage
            const localKey = `puntos_${userId}`;
            localStorage.setItem(localKey, JSON.stringify({
                ...puntosData,
                puntos: nuevoSaldo,
                puntosCanjeados: puntosCanjeados,
                historial: historialActual,
                ultimoCanje: new Date()
            }));
        }
        
        // Crear cupón
        const cupon = {
            codigo: `INTI${Date.now()}`,
            porcentaje: DESCUENTO_PORCENTAJE,
            fechaCanje: new Date().toISOString(),
            usado: false,
            validoHasta: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
        localStorage.setItem('cuponDescuento', JSON.stringify(cupon));
        
        return { 
            success: true, 
            descuento: DESCUENTO_PORCENTAJE,
            puntosRestantes: nuevoSaldo,
            cupon: cupon,
            mensaje: `🎉 ¡Canjeaste ${puntosUsar} puntos por ${DESCUENTO_PORCENTAJE}% de descuento!`
        };
        
    } catch (error) {
        console.error("❌ Error canjeando puntos:", error);
        return { success: false, mensaje: "Error al canjear puntos. Intenta nuevamente." };
    }
}

// ============================================
// APLICAR DESCUENTO AL CARRITO
// ============================================
export function aplicarDescuento(total, porcentaje) {
    return total * (1 - porcentaje / 100);
}

// ============================================
// OBTENER CUPÓN ACTIVO
// ============================================
export function obtenerCuponActivo() {
    const cuponStr = localStorage.getItem('cuponDescuento');
    if (!cuponStr) return null;
    
    try {
        const cupon = JSON.parse(cuponStr);
        if (cupon.usado) return null;
        if (new Date(cupon.validoHasta) < new Date()) {
            localStorage.removeItem('cuponDescuento');
            return null;
        }
        return cupon;
    } catch {
        return null;
    }
}

// ============================================
// MARCAR CUPÓN COMO USADO
// ============================================
export function marcarCuponUsado() {
    const cuponStr = localStorage.getItem('cuponDescuento');
    if (cuponStr) {
        try {
            const cupon = JSON.parse(cuponStr);
            cupon.usado = true;
            localStorage.setItem('cuponDescuento', JSON.stringify(cupon));
        } catch {}
    }
}

// ============================================
// RENDERIZAR UI DE PUNTOS
// ============================================
export function renderizarPuntosUI(puntosData, userId) {
    const cuponActivo = obtenerCuponActivo();
    const puntosActuales = puntosData.puntos || 0;
    const puntosNecesarios = PUNTOS_POR_DESCUENTO;
    const puedeCanjear = puntosActuales >= puntosNecesarios && !cuponActivo;
    
    return `
        <div class="puntos-card" style="background: linear-gradient(135deg, rgba(201,169,98,0.15), rgba(154,123,61,0.1)); border-radius: 20px; padding: 25px; margin: 20px 0; border: 1px solid #C9A962;">
            <div class="puntos-header" style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                <div style="font-size: 3rem;">⭐</div>
                <div style="flex: 1;">
                    <h3 style="color: #C9A962; margin: 0 0 5px 0;">Tus Puntos de Lealtad</h3>
                    <p style="font-size: 2.5rem; font-weight: bold; margin: 0; color: #C9A962;">${puntosActuales} pts</p>
                    <p style="margin: 5px 0; font-size: 0.85rem;">💰 Total gastado: $${(puntosData.totalGastado || 0).toFixed(2)} MXN</p>
                    <p style="font-size: 0.7rem; opacity: 0.8;">💡 Cada $${PUNTOS_POR_GASTO} MXN = 1 punto | ${PUNTOS_POR_DESCUENTO} puntos = ${DESCUENTO_PORCENTAJE}% descuento</p>
                </div>
                ${puedeCanjear ? `
                    <button id="btnCanjearPuntos" style="background: linear-gradient(135deg, #C9A962, #9A7B3D); border: none; padding: 12px 24px; border-radius: 30px; color: #0D0D0D; font-weight: bold; cursor: pointer; transition: all 0.3s;">
                        🎁 Canjear ${PUNTOS_POR_DESCUENTO} pts (${DESCUENTO_PORCENTAJE}% OFF)
                    </button>
                ` : cuponActivo ? `
                    <div style="background: #4CAF50; padding: 10px 20px; border-radius: 30px; color: white;">
                        🎫 Cupón activo: ${cuponActivo.porcentaje}% descuento
                        <br><small>Código: ${cuponActivo.codigo}</small>
                    </div>
                ` : `
                    <button disabled style="background: #666; border: none; padding: 12px 24px; border-radius: 30px; opacity: 0.5; cursor: not-allowed;">
                        🔒 Faltan ${puntosNecesarios - puntosActuales} pts
                    </button>
                `}
            </div>
            <div class="puntos-stats" style="display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(201,169,98,0.3);">
                <div class="stat-item" style="text-align: center; flex: 1;">
                    <div class="stat-value" style="font-size: 1.3rem; font-weight: bold; color: #C9A962;">${puntosData.puntosAcumulados || 0}</div>
                    <div class="stat-label" style="font-size: 0.75rem; color: #888;">Puntos acumulados</div>
                </div>
                <div class="stat-item" style="text-align: center; flex: 1;">
                    <div class="stat-value" style="font-size: 1.3rem; font-weight: bold; color: #C9A962;">${puntosData.puntosCanjeados || 0}</div>
                    <div class="stat-label" style="font-size: 0.75rem; color: #888;">Puntos canjeados</div>
                </div>
                <div class="stat-item" style="text-align: center; flex: 1;">
                    <div class="stat-value" style="font-size: 1.3rem; font-weight: bold; color: #C9A962;">$${(puntosData.totalGastado || 0).toFixed(2)}</div>
                    <div class="stat-label" style="font-size: 0.75rem; color: #888;">Total gastado</div>
                </div>
            </div>
        </div>
    `;
}

console.log("⭐ Sistema de puntos cargado correctamente");