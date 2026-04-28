import { auth, db, collection, addDoc, doc, getDoc, setDoc } from './firebase-config.js';
import { calcularTiempoEstimado } from './tiempo-pedido.js';

let cart = [];
let modoParaLlevar = false;
let cuponAplicado = null;

// ============================================
// FUNCIÓN PARA AGREGAR PUNTOS
// ============================================
async function agregarPuntos(userId, montoTotal, pedidoId) {
    try {
        const PUNTOS_POR_GASTO = 100;
        const puntosGanados = Math.floor(montoTotal / PUNTOS_POR_GASTO);
        
        if (puntosGanados === 0) return 0;
        
        const puntosRef = doc(db, "puntos", userId);
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
        
        return puntosGanados;
        
    } catch (error) {
        console.error("Error agregando puntos:", error);
        return 0;
    }
}

// ============================================
// FUNCIÓN PARA OBTENER CUPÓN ACTIVO
// ============================================
function obtenerCuponActivo() {
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
// MOSTRAR NOTIFICACIÓN (SOLO ERRORES Y CONFIRMACIÓN)
// ============================================
function mostrarNotificacion(mensaje, tipo = 'success') {
    if (tipo === 'error' || tipo === 'pedido') {
        let backgroundColor = tipo === 'error' ? '#f44336' : '#4CAF50';
        let icono = tipo === 'error' ? '❌' : '✅';
        
        if (typeof Toastify !== 'undefined') {
            Toastify({
                text: `${icono} ${mensaje}`,
                duration: 3000,
                gravity: "top",
                position: "right",
                style: { background: backgroundColor, borderRadius: "12px" }
            }).showToast();
        }
    }
    // No mostrar notificaciones para 'success' de agregar al carrito
}

// ============================================
// ACTUALIZAR CARRITO
// ============================================
function actualizarCarrito() {
    const totalItems = cart.reduce((sum, item) => sum + item.cantidad, 0);
    let subtotal = cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    let descuento = 0;
    let total = subtotal;
    
    if (cuponAplicado && !cuponAplicado.usado) {
        descuento = subtotal * (cuponAplicado.porcentaje / 100);
        total = subtotal - descuento;
    }
    
    // Actualizar contador flotante
    const cartCountSpan = document.getElementById('cartCount');
    if (cartCountSpan) cartCountSpan.textContent = totalItems;
    
    // Mostrar/ocultar carrito flotante
    const cartFloatingDiv = document.getElementById('cartFloating');
    if (cartFloatingDiv) {
        if (totalItems > 0) cartFloatingDiv.classList.remove('hidden');
        else cartFloatingDiv.classList.add('hidden');
    }
    
    // Actualizar modal
    const cartItemsDiv = document.getElementById('cartItems');
    if (cartItemsDiv) {
        if (cart.length === 0) {
            cartItemsDiv.innerHTML = '<p style="text-align: center; padding: 20px;">🛒 Tu carrito está vacío</p>';
            return;
        }
        
        cartItemsDiv.innerHTML = cart.map((item, index) => `
            <div class="cart-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 10px;">
                <div style="flex: 2;">
                    <strong>${item.nombre}</strong>
                    <p style="margin: 0; font-size: 0.85rem;">$${item.precio.toFixed(2)} MXN x ${item.cantidad}</p>
                </div>
                <div style="flex: 1; text-align: right;">
                    <span style="font-weight: bold;">$${(item.precio * item.cantidad).toFixed(2)} MXN</span>
                    <div style="margin-top: 5px;">
                        <button onclick="window.modificarCantidad(${index}, -1)" style="background: none; border: none; color: #f44336; cursor: pointer; font-size: 1.2rem; padding: 5px;">−</button>
                        <button onclick="window.modificarCantidad(${index}, 1)" style="background: none; border: none; color: #4CAF50; cursor: pointer; font-size: 1.2rem; padding: 5px;">+</button>
                        <button onclick="window.eliminarDelCarrito(${index})" style="background: none; border: none; color: #f44336; cursor: pointer; padding: 5px;">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
        
        const totalHTML = `
            <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #C9A962;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span>Subtotal:</span><span>$${subtotal.toFixed(2)} MXN</span>
                </div>
                ${descuento > 0 ? `
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; color: #4CAF50;">
                    <span>🎫 Descuento (${cuponAplicado.porcentaje}%):</span><span> -$${descuento.toFixed(2)} MXN</span>
                </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; font-size: 1.2rem; font-weight: bold;">
                    <span>Total:</span><span>$${total.toFixed(2)} MXN</span>
                </div>
            </div>
        `;
        
        const existingTotal = cartItemsDiv.querySelector('.cart-total-container');
        if (existingTotal) {
            existingTotal.innerHTML = totalHTML;
        } else {
            const totalContainer = document.createElement('div');
            totalContainer.className = 'cart-total-container';
            totalContainer.innerHTML = totalHTML;
            cartItemsDiv.appendChild(totalContainer);
        }
    }
}
function actualizarBadges() {
    document.querySelectorAll('.btn-add').forEach(btn => {
        const itemName = btn.dataset.item;
        const item = cart.find(i => i.nombre === itemName);
        const cantidadSpan = btn.querySelector('.cantidad');
        const textoSpan = btn.querySelector('.texto-btn');
        
        if (item && item.cantidad > 0) {
            btn.classList.add('has-items');
            if (cantidadSpan) cantidadSpan.textContent = item.cantidad;
            if (textoSpan) textoSpan.textContent = 'Agregado';
        } else {
            btn.classList.remove('has-items');
            if (cantidadSpan) cantidadSpan.textContent = '0';
            if (textoSpan) textoSpan.textContent = 'Agregar';
        }
    });
}
window.modificarCantidad = function(index, cambio) {
    if (!cart[index]) return;
    cart[index].cantidad += cambio;
    if (cart[index].cantidad <= 0) {
        cart.splice(index, 1);
    }
    actualizarCarrito();
    actualizarBadges();
};

window.eliminarDelCarrito = function(index) {
    cart.splice(index, 1);
    actualizarCarrito();
    actualizarBadges();
};
function inicializarTabs() {
    document.querySelectorAll('.menu-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const category = tab.dataset.category;
            document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.menu-section').forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(category);
            if (targetSection) targetSection.classList.add('active');
        });
    });
}
function inicializarBotonesAgregar() {
    document.querySelectorAll('.btn-add').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.dataset.item;
            const price = parseFloat(btn.dataset.price);
            
            if (!item || isNaN(price)) {
                console.error("Item inválido:", btn);
                return;
            }
            
            const existingItem = cart.find(i => i.nombre === item);
            if (existingItem) {
                existingItem.cantidad++;
            } else {
                cart.push({ nombre: item, precio: price, cantidad: 1 });
            }
            
            actualizarCarrito();
            actualizarBadges();
        });
    });
}
function inicializarModal() {
    const btnVerPedido = document.getElementById('btnVerPedido');
    const modalPedido = document.getElementById('modalPedido');
    const closeBtns = document.querySelectorAll('.modal .close, .modal');
    
    if (btnVerPedido && modalPedido) {
        btnVerPedido.addEventListener('click', () => {
            actualizarCarrito();
            modalPedido.classList.add('active');
        });
    }
    
    closeBtns.forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === modalPedido || e.target.classList?.contains('close')) {
                if (modalPedido) modalPedido.classList.remove('active');
            }
        });
    });
}
function inicializarModoParaLlevar() {
    const modalPedido = document.getElementById('modalPedido');
    if (!modalPedido) return;
    
    const modalContent = modalPedido.querySelector('.modal-content');
    if (!modalContent || modalContent.querySelector('.modo-para-llevar')) return;
    
    const modoHTML = `
        <div class="modo-para-llevar" style="margin: 20px 0; padding: 15px; background: rgba(201,169,98,0.1); border-radius: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <span style="font-weight: 500;">📦 Modo de servicio:</span>
                <div style="display: flex; gap: 15px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px 16px; border-radius: 25px; background: ${!modoParaLlevar ? '#C9A962' : 'transparent'}; color: ${!modoParaLlevar ? '#0D0D0D' : '#C9A962'}; border: 1px solid #C9A962;">
                        <input type="radio" name="modoServicio" value="local" ${!modoParaLlevar ? 'checked' : ''} style="display: none;"> 🍽️ En Restaurante
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px 16px; border-radius: 25px; background: ${modoParaLlevar ? '#C9A962' : 'transparent'}; color: ${modoParaLlevar ? '#0D0D0D' : '#C9A962'}; border: 1px solid #C9A962;">
                        <input type="radio" name="modoServicio" value="llevar" ${modoParaLlevar ? 'checked' : ''} style="display: none;"> 📦 Para Llevar
                    </label>
                </div>
            </div>
        </div>
    `;
    
    const modalH3 = modalContent.querySelector('h3');
    if (modalH3) {
        modalH3.insertAdjacentHTML('afterend', modoHTML);
        
        document.querySelectorAll('input[name="modoServicio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                modoParaLlevar = e.target.value === 'llevar';
                const labels = document.querySelectorAll('.modo-para-llevar label');
                labels.forEach(label => {
                    const isActive = (modoParaLlevar && label.querySelector('input[value="llevar"]')) ||
                                   (!modoParaLlevar && label.querySelector('input[value="local"]'));
                    label.style.background = isActive ? '#C9A962' : 'transparent';
                    label.style.color = isActive ? '#0D0D0D' : '#C9A962';
                });
            });
        });
    }
}
function inicializarBotonPedido() {
    const btnHacerPedido = document.getElementById('btnHacerPedido');
    if (!btnHacerPedido) return;
    
    btnHacerPedido.addEventListener('click', async () => {
        const user = auth.currentUser;
        
        if (!user) {
            mostrarNotificacion('Inicia sesión para hacer un pedido', 'error');
            setTimeout(() => window.location.href = 'login.html', 1500);
            return;
        }
        
        if (cart.length === 0) {
            mostrarNotificacion('Tu carrito está vacío', 'error');
            return;
        }
        
        const btn = btnHacerPedido;
        const originalText = btn.textContent;
        btn.textContent = '⏳ Procesando...';
        btn.disabled = true;
        
        try {
            const subtotal = cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
            let descuentoAplicado = 0;
            
            if (cuponAplicado && !cuponAplicado.usado) {
                descuentoAplicado = subtotal * (cuponAplicado.porcentaje / 100);
            }
            
            const total = subtotal - descuentoAplicado;
            const tiempoEstimado = calcularTiempoEstimado(cart);
            
            const pedidoData = {
                userId: user.uid,
                userEmail: user.email,
                items: cart.map(item => ({
                    nombre: item.nombre,
                    precio: item.precio,
                    cantidad: item.cantidad
                })),
                subtotal: subtotal,
                descuento: descuentoAplicado,
                total: total,
                estado: 'pendiente',
                modoParaLlevar: modoParaLlevar,
                tiempoEstimado: tiempoEstimado,
                fechaCreacion: new Date()
            };
            
            const pedidoRef = await addDoc(collection(db, "pedidos"), pedidoData);
            
            const puntosGanados = await agregarPuntos(user.uid, total, pedidoRef.id);
            
            if (cuponAplicado) {
                cuponAplicado.usado = true;
                localStorage.setItem('cuponDescuento', JSON.stringify(cuponAplicado));
                cuponAplicado = null;
            }
            
            cart = [];
            actualizarCarrito();
            actualizarBadges();
            
            const modalPedido = document.getElementById('modalPedido');
            if (modalPedido) modalPedido.classList.remove('active');
            
            let mensaje = `✅ ¡Pedido realizado! #${pedidoRef.id.slice(-6)}`;
            if (puntosGanados > 0) mensaje += ` +${puntosGanados} puntos`;
            mensaje += ` | Tiempo: ${tiempoEstimado} min`;
            mostrarNotificacion(mensaje, 'pedido');
            
            setTimeout(() => {
                if (confirm("¿Ver estado de tu pedido?")) {
                    window.location.href = 'mis-pedidos.html';
                }
            }, 1500);
            
        } catch (error) {
            console.error("Error al realizar pedido:", error);
            mostrarNotificacion('Error al realizar el pedido', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}
function verificarCuponInicial() {
    const cupon = obtenerCuponActivo();
    if (cupon && !cupon.usado) {
        cuponAplicado = cupon;
        mostrarNotificacion(`🎫 Cupón de ${cupon.porcentaje}% descuento disponible!`, 'info');
    }
}
document.addEventListener('DOMContentLoaded', () => {
    console.log("🍽️ Inicializando menu.js...");
    inicializarTabs();
    inicializarBotonesAgregar();
    inicializarModal();
    inicializarModoParaLlevar();
    inicializarBotonPedido();
    verificarCuponInicial();
    actualizarBadges();
    console.log("✅ menu.js inicializado correctamente");
});

console.log("📦 menu.js cargado - Sin alertas al agregar productos");