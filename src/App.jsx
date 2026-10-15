import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Auth from './Auth'
import './App.css'

const MENU = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'produk', label: 'Produk' },
  { id: 'kategori', label: 'Kategori' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'penjualan', label: 'Penjualan' },
  { id: 'laporan', label: 'Laporan' },
]

const rupiah = (value) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))

function ErrorBox({ children }) { return children ? <div className="error-message">{children}</div> : null }

export default function App() {
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAdmin, setCheckingAdmin] = useState(false)
  const [page, setPage] = useState('dashboard')
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [sales, setSales] = useState([]) // dari supabase
  const [saleDetails, setSaleDetails] = useState([]) // detail lokal untuk laporan & nota {saleId, produk_id, nama_produk, jumlah, harga_modal, harga_jual, total, profit, tanggal, metode}
  const [loadingData, setLoadingData] = useState(false)
  const [dataError, setDataError] = useState('')
  const [notice, setNotice] = useState('')
  const [savingProduct, setSavingProduct] = useState(false)
  const [savingKategori, setSavingKategori] = useState(false)
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [savingPenjualan, setSavingPenjualan] = useState(false)
  const [selectedNota, setSelectedNota] = useState(null) // untuk cetak struk

  const [productForm, setProductForm] = useState({ nama_produk: '', kategori_id: '', harga_modal: '', harga_jual: '', stok: '0', supplier_id: '' })
  const [kategoriForm, setKategoriForm] = useState({ nama_kategori: '', deskripsi: '' })
  const [supplierForm, setSupplierForm] = useState({ nama_supplier: '', nama_kontak: '', no_telepon: '', alamat: '' })
  const [penjualanForm, setPenjualanForm] = useState({ produk_id: '', jumlah: '1', metode_pembayaran: 'Tunai' })

  useEffect(() => {
    let active = true
    async function getInitialSession() {
      const { data, error } = await supabase.auth.getSession()
      if (!active) return
      if (error) setDataError('Gagal memeriksa sesi login: ' + error.message)
      setSession(data?.session ?? null); setCheckingSession(false)
    }
    getInitialSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => { if (active) { setSession(newSession); setIsAdmin(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    let active = true
    async function verifyAdmin() {
      if (!session?.user?.id) { setIsAdmin(false); setCheckingAdmin(false); return }
      setCheckingAdmin(true); setDataError('')
      const { data, error } = await supabase.from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle()
      if (!active) return
      if (error) { setIsAdmin(false); setDataError('Gagal memeriksa hak admin: ' + error.message) }
      else { setIsAdmin(Boolean(data)); if (!data) setDataError('Akun ini belum terdaftar sebagai admin THENARA di tabel admin_users.') }
      setCheckingAdmin(false)
    }
    verifyAdmin(); return () => { active = false }
  }, [session])

  const loadData = useCallback(async () => {
    if (!session?.user?.id || !isAdmin) return
    setLoadingData(true); setDataError(''); setNotice('')
    const results = await Promise.all([
      supabase.from('produk').select('*').order('nama_produk'),
      supabase.from('kategori').select('*').order('nama_kategori'),
      supabase.from('supplier').select('*').order('nama_supplier'),
      supabase.from('tabel penjualan').select('*').order('tanggal_penjualan', { ascending: false }),
    ])
    const labels = ['produk', 'kategori', 'supplier', 'penjualan']
    const setters = [setProducts, setCategories, setSuppliers, setSales]
    const errors = []
    results.forEach((r, i) => { if (r.error) errors.push(labels[i] + ': ' + r.error.message); else setters[i](r.data ?? []) })
    if (errors.length) setDataError('Sebagian data gagal dimuat — ' + errors.join(' | '))
    // Load sale details dari localStorage untuk laporan keuntungan yang akurat
    try {
      const savedDetails = localStorage.getItem('thenara_sale_details')
      if (savedDetails) setSaleDetails(JSON.parse(savedDetails))
    } catch(e) {}
    setLoadingData(false)
  }, [session, isAdmin])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    try { localStorage.setItem('thenara_sale_details', JSON.stringify(saleDetails)) } catch(e) {}
  }, [saleDetails])

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()
    if (error) setDataError('Gagal keluar: ' + error.message)
    else { setSession(null); setIsAdmin(false); setProducts([]); setCategories([]); setSuppliers([]); setSales([]); setPage('dashboard') }
  }

  function updateProductForm(e) { const { name, value } = e.target; setProductForm((c) => ({ ...c, [name]: value })) }
  function updateKategoriForm(e) { const { name, value } = e.target; setKategoriForm((c) => ({ ...c, [name]: value })) }
  function updateSupplierForm(e) { const { name, value } = e.target; setSupplierForm((c) => ({ ...c, [name]: value })) }
  function updatePenjualanForm(e) { const { name, value } = e.target; setPenjualanForm((c) => ({ ...c, [name]: value })) }

  async function handleSaveProduct(e) {
    e.preventDefault(); setDataError(''); setNotice('')
    if (!productForm.nama_produk.trim()) { setDataError('Nama produk wajib diisi.'); return }
    const hargaModal = Number(productForm.harga_modal || 0); const hargaJual = Number(productForm.harga_jual || 0); const stok = Number(productForm.stok || 0)
    if (!Number.isFinite(hargaModal) || !Number.isFinite(hargaJual) || !Number.isInteger(stok) || hargaModal < 0 || hargaJual < 0 || stok < 0) { setDataError('Harga dan stok harus valid.'); return }
    setSavingProduct(true)
    const { data, error } = await supabase.from('produk').insert({ nama_produk: productForm.nama_produk.trim(), harga_modal: hargaModal, harga_jual: hargaJual, stok, kategori_id: productForm.kategori_id || null, supplier_id: productForm.supplier_id || null }).select().single()
    setSavingProduct(false)
    if (error) { setDataError('Produk gagal disimpan: ' + error.message); return }
    setProducts((cur) => [...cur, data].sort((a, b) => (a.nama_produk || '').localeCompare(b.nama_produk || '')))
    setProductForm({ nama_produk: '', kategori_id: '', harga_modal: '', harga_jual: '', stok: '0', supplier_id: '' }); setNotice('Produk berhasil disimpan.'); setPage('produk')
  }

  async function handleSaveKategori(e) {
    e.preventDefault(); setDataError(''); setNotice('')
    if (!kategoriForm.nama_kategori.trim()) { setDataError('Nama kategori wajib diisi.'); return }
    setSavingKategori(true)
    const { data, error } = await supabase.from('kategori').insert({ nama_kategori: kategoriForm.nama_kategori.trim(), deskripsi: kategoriForm.deskripsi.trim() || null }).select().single()
    setSavingKategori(false)
    if (error) { setDataError('Kategori gagal disimpan: ' + error.message); return }
    setCategories((cur) => [...cur, data].sort((a, b) => (a.nama_kategori || '').localeCompare(b.nama_kategori || '')))
    setKategoriForm({ nama_kategori: '', deskripsi: '' }); setNotice('Kategori berhasil disimpan.')
  }

  async function handleSaveSupplier(e) {
    e.preventDefault(); setDataError(''); setNotice('')
    if (!supplierForm.nama_supplier.trim()) { setDataError('Nama supplier wajib diisi.'); return }
    setSavingSupplier(true)
    const { data, error } = await supabase.from('supplier').insert({ nama_supplier: supplierForm.nama_supplier.trim(), nama_kontak: supplierForm.nama_kontak.trim() || null, no_telepon: supplierForm.no_telepon.trim() || null, alamat: supplierForm.alamat.trim() || null }).select().single()
    setSavingSupplier(false)
    if (error) { setDataError('Supplier gagal disimpan: ' + error.message); return }
    setSuppliers((cur) => [...cur, data].sort((a, b) => (a.nama_supplier || '').localeCompare(b.nama_supplier || '')))
    setSupplierForm({ nama_supplier: '', nama_kontak: '', no_telepon: '', alamat: '' }); setNotice('Supplier berhasil disimpan.')
  }

  async function handleSavePenjualan(e) {
    e.preventDefault(); setDataError(''); setNotice('')
    const selectedProduct = products.find(p => p.id === penjualanForm.produk_id)
    if (!selectedProduct) { setDataError('Pilih produk terlebih dahulu.'); return }
    const jumlah = Number(penjualanForm.jumlah || 0)
    if (!Number.isInteger(jumlah) || jumlah <= 0) { setDataError('Jumlah harus angka minimal 1.'); return }
    if (Number(selectedProduct.stok || 0) < jumlah) { setDataError(`Stok tidak cukup. Stok ${selectedProduct.nama_produk} sisa ${selectedProduct.stok}.`); return }
    const total = Number(selectedProduct.harga_jual || 0) * jumlah
    const modalTotal = Number(selectedProduct.harga_modal || 0) * jumlah
    const profit = total - modalTotal
    setSavingPenjualan(true)
    const { data: saleData, error: saleError } = await supabase.from('tabel penjualan').insert({
      total_penjualan: total,
      metode_pembayaran: penjualanForm.metode_pembayaran,
      status_transaksi: 'selesai',
      tanggal_penjualan: new Date().toISOString(),
    }).select().single()
    if (saleError) { setSavingPenjualan(false); setDataError('Penjualan gagal disimpan: ' + saleError.message); return }
    const newStok = Number(selectedProduct.stok) - jumlah
    const { error: stokError } = await supabase.from('produk').update({ stok: newStok }).eq('id', selectedProduct.id)
    if (stokError) { setSavingPenjualan(false); setDataError('Penjualan tercatat tapi stok gagal diupdate: ' + stokError.message); setSales((cur) => [saleData, ...cur]); return }
    const detail = {
      saleId: saleData.id,
      produk_id: selectedProduct.id,
      nama_produk: selectedProduct.nama_produk,
      jumlah,
      harga_modal: Number(selectedProduct.harga_modal || 0),
      harga_jual: Number(selectedProduct.harga_jual || 0),
      total,
      modalTotal,
      profit,
      tanggal: saleData.tanggal_penjualan,
      metode: penjualanForm.metode_pembayaran
    }
    setSavingPenjualan(false)
    setProducts((cur) => cur.map(p => p.id === selectedProduct.id ? { ...p, stok: newStok } : p))
    setSales((cur) => [saleData, ...cur])
    setSaleDetails((cur) => [detail, ...cur])
    setPenjualanForm({ produk_id: '', jumlah: '1', metode_pembayaran: 'Tunai' })
    setNotice(`Penjualan berhasil! ${selectedProduct.nama_produk} x${jumlah} = ${rupiah(total)}. Profit: ${rupiah(profit)}`)
    setSelectedNota(detail)
    setPage('penjualan')
  }

  function handlePrintNota(detail) {
    const printWindow = window.open('', '_blank', 'width=400,height=600')
    if (!printWindow) { alert('Izinkan popup untuk cetak struk'); return }
    printWindow.document.write(`
      <html><head><title>Struk THENARA</title>
      <style>
        body{font-family:monospace; padding:20px; max-width:350px; margin:auto; color:#000}
        .center{text-align:center}
        .line{border-top:1px dashed #000; margin:12px 0}
        .row{display:flex; justify-content:space-between}
        h2{margin:0; letter-spacing:3px}
        small{color:#555}
        @media print{button{display:none}}
      </style></head><body>
        <div class="center">
          <h2>THENARA</h2>
          <div>BOUTIQUE ADMIN</div>
          <small>Jl. Boutique No.1 Pekanbaru</small><br/>
          <small>IG: @thenara.boutique</small>
        </div>
        <div class="line"></div>
        <div class="row"><span>Tanggal:</span><span>${new Date(detail.tanggal).toLocaleString('id-ID')}</span></div>
        <div class="row"><span>No Nota:</span><span>${String(detail.saleId).slice(0,8).toUpperCase()}</span></div>
        <div class="row"><span>Metode:</span><span>${detail.metode}</span></div>
        <div class="line"></div>
        <div><strong>${detail.nama_produk}</strong></div>
        <div class="row"><span>${detail.jumlah} x ${rupiah(detail.harga_jual)}</span><span>${rupiah(detail.total)}</span></div>
        <div class="line"></div>
        <div class="row"><strong>Total Bayar</strong><strong>${rupiah(detail.total)}</strong></div>
        <div class="line"></div>
        <div class="center"><small>Terima kasih telah berbelanja di THENARA</small><br/><small>Barang yang sudah dibeli tidak dapat dikembalikan</small></div>
        <br/><div class="center"><button onclick="window.print();window.close()" style="padding:10px 20px; background:#2d4a3a; color:white; border:none; border-radius:8px; cursor:pointer">Cetak / Simpan PDF</button></div>
      </body></html>
    `)
    printWindow.document.close()
  }

  if (checkingSession || checkingAdmin) return <div className="loading-state">Memeriksa akses THENARA...</div>
  if (!session) return <Auth />
  if (!isAdmin) return (<main className="login-page"><section className="login-card"><h1 className="login-brand">THENARA</h1><p className="login-subtitle">BOUTIQUE ADMIN</p><ErrorBox>{dataError || 'Akun belum memiliki akses admin.'}</ErrorBox><button className="button button-secondary" onClick={handleLogout}>Keluar</button></section></main>)

  const totalNilaiStok = products.reduce((t, it) => t + Number(it.harga_modal || 0) * Number(it.stok || 0), 0)
  const totalPenjualan = sales.reduce((t, it) => t + Number(it.total_penjualan || 0), 0)
  const totalModalTerjual = saleDetails.reduce((t, d) => t + (d.modalTotal || 0), 0)
  const totalProfit = saleDetails.reduce((t, d) => t + (d.profit || 0), 0)
  const titles = { dashboard: 'Dashboard', produk: 'Data Produk', kategori: 'Kategori Produk', supplier: 'Data Supplier', penjualan: 'Data Penjualan', laporan: 'Laporan Keuntungan' }
  const selectedProductForSale = products.find(p => p.id === penjualanForm.produk_id)
  const previewTotal = selectedProductForSale ? Number(selectedProductForSale.harga_jual || 0) * Number(penjualanForm.jumlah || 0) : 0
  const previewModal = selectedProductForSale ? Number(selectedProductForSale.harga_modal || 0) * Number(penjualanForm.jumlah || 0) : 0
  const previewProfit = previewTotal - previewModal

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><h1 className="brand-name">THENARA</h1><div className="brand-subtitle">BOUTIQUE ADMIN</div></div>
        <div className="nav-label">Menu Utama</div>
        {MENU.map((item) => (<button key={item.id} className={`nav-button ${page === item.id ? 'active' : ''}`} onClick={() => { setPage(item.id); setDataError(''); setNotice('') }}>{item.label}</button>))}
        <div className="sidebar-footer"><div>Login sebagai</div><div style={{ marginTop: 6, overflowWrap: 'anywhere' }}>{session.user.email}</div><button className="nav-button" style={{ marginTop: 16 }} onClick={handleLogout}>Keluar</button></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div><h2 className="page-title">{titles[page]}</h2><p className="page-subtitle">Sistem pengelolaan butik THENARA</p></div><div className="admin-chip">Administrator</div></header>
        <ErrorBox>{dataError}</ErrorBox>
        {notice && <div className="success-message">{notice}</div>}
        <div className="panel-heading"><span className="muted">{loadingData ? 'Memuat data...' : 'Data terbaru dari Supabase'}</span><button className="button button-secondary" onClick={loadData} disabled={loadingData}>{loadingData ? 'Memuat...' : 'Muat Ulang Data'}</button></div>

        {page === 'dashboard' && (<><section className="stats-grid"><div className="stat-card"><div className="stat-label">Jumlah Produk</div><div className="stat-value">{products.length}</div></div><div className="stat-card"><div className="stat-label">Kategori</div><div className="stat-value">{categories.length}</div></div><div className="stat-card"><div className="stat-label">Supplier</div><div className="stat-value">{suppliers.length}</div></div><div className="stat-card"><div className="stat-label">Total Omzet</div><div className="stat-value" style={{ fontSize: 18 }}>{rupiah(totalPenjualan)}</div></div></section><section className="stats-grid"><div className="stat-card" style={{borderLeft:'4px solid #2d4a3a'}}><div className="stat-label">Total Modal Terjual</div><div className="stat-value" style={{ fontSize: 18 }}>{rupiah(totalModalTerjual)}</div></div><div className="stat-card" style={{borderLeft:'4px solid #16a34a'}}><div className="stat-label">Total Keuntungan Bersih</div><div className="stat-value" style={{ fontSize: 20, color:'#16a34a' }}>{rupiah(totalProfit)}</div></div><div className="stat-card"><div className="stat-label">Nilai Stok Saat Ini</div><div className="stat-value" style={{ fontSize: 18 }}>{rupiah(totalNilaiStok)}</div></div><div className="stat-card"><div className="stat-label">Transaksi</div><div className="stat-value">{sales.length}</div></div></section><section className="panel"><div className="panel-heading"><h3 className="panel-title">Produk Terbaru</h3><button className="button button-secondary" onClick={() => setPage('produk')}>Kelola Produk</button></div><ProductTable products={products.slice(0, 10)} /></section></>)}

        {page === 'produk' && (<><section className="panel"><h3 className="panel-title">Tambah Produk</h3><form onSubmit={handleSaveProduct}><div className="form-grid"><div className="field field-full"><label>Nama Produk *</label><input name="nama_produk" value={productForm.nama_produk} onChange={updateProductForm} placeholder="Contoh: Mukena Silk" required /></div><div className="field"><label>Kategori</label><select name="kategori_id" value={productForm.kategori_id} onChange={updateProductForm}><option value="">Pilih kategori (opsional)</option>{categories.map((c) => (<option key={c.id} value={c.id}>{c.nama_kategori}</option>))}</select></div><div className="field"><label>Supplier</label><select name="supplier_id" value={productForm.supplier_id} onChange={updateProductForm}><option value="">Pilih supplier (opsional)</option>{suppliers.map((s) => (<option key={s.id} value={s.id}>{s.nama_supplier}</option>))}</select></div><div className="field"><label>Harga Modal (Rp)</label><input name="harga_modal" type="number" min="0" value={productForm.harga_modal} onChange={updateProductForm} /></div><div className="field"><label>Harga Jual (Rp)</label><input name="harga_jual" type="number" min="0" value={productForm.harga_jual} onChange={updateProductForm} /></div><div className="field"><label>Stok</label><input name="stok" type="number" min="0" value={productForm.stok} onChange={updateProductForm} required /></div></div><div style={{ marginTop: 20 }}><button className="button button-primary" type="submit" disabled={savingProduct}>{savingProduct ? 'Menyimpan...' : 'Simpan Produk'}</button></div></form></section><section className="panel"><h3 className="panel-title" style={{ marginBottom: 18 }}>Daftar Produk ({products.length})</h3><ProductTable products={products} /></section></>)}

        {page === 'kategori' && (<><section className="panel"><h3 className="panel-title">Tambah Kategori</h3><form onSubmit={handleSaveKategori}><div className="form-grid"><div className="field"><label>Nama Kategori *</label><input name="nama_kategori" value={kategoriForm.nama_kategori} onChange={updateKategoriForm} placeholder="Contoh: Abaya" required /></div><div className="field"><label>Deskripsi</label><input name="deskripsi" value={kategoriForm.deskripsi} onChange={updateKategoriForm} placeholder="Koleksi abaya premium" /></div></div><div style={{ marginTop: 20 }}><button className="button button-primary" type="submit" disabled={savingKategori}>{savingKategori ? 'Menyimpan...' : 'Simpan Kategori'}</button></div></form></section><section className="panel"><h3 className="panel-title" style={{ marginBottom: 18 }}>Daftar Kategori ({categories.length})</h3><div className="table-wrap"><table><thead><tr><th>Nama Kategori</th><th>Deskripsi</th></tr></thead><tbody>{categories.map((item) => (<tr key={item.id}><td>{item.nama_kategori}</td><td>{item.deskripsi || '-'}</td></tr>))}</tbody></table></div></section></>)}

        {page === 'supplier' && (<><section className="panel"><h3 className="panel-title">Tambah Supplier</h3><form onSubmit={handleSaveSupplier}><div className="form-grid"><div className="field"><label>Nama Supplier *</label><input name="nama_supplier" value={supplierForm.nama_supplier} onChange={updateSupplierForm} placeholder="Grosir Tanah Abang" required /></div><div className="field"><label>Nama Kontak</label><input name="nama_kontak" value={supplierForm.nama_kontak} onChange={updateSupplierForm} placeholder="Pak Andi" /></div><div className="field"><label>No Telepon</label><input name="no_telepon" value={supplierForm.no_telepon} onChange={updateSupplierForm} placeholder="0812..." /></div><div className="field"><label>Alamat</label><input name="alamat" value={supplierForm.alamat} onChange={updateSupplierForm} placeholder="Jakarta / Bandung" /></div></div><div style={{ marginTop: 20 }}><button className="button button-primary" type="submit" disabled={savingSupplier}>{savingSupplier ? 'Menyimpan...' : 'Simpan Supplier'}</button></div></form></section><section className="panel"><h3 className="panel-title" style={{ marginBottom: 18 }}>Daftar Supplier ({suppliers.length})</h3><div className="table-wrap"><table><thead><tr><th>Nama Supplier</th><th>Kontak</th><th>Telepon</th><th>Alamat</th></tr></thead><tbody>{suppliers.map((item) => (<tr key={item.id}><td>{item.nama_supplier}</td><td>{item.nama_kontak || '-'}</td><td>{item.no_telepon || '-'}</td><td>{item.alamat || '-'}</td></tr>))}</tbody></table></div></section></>)}

        {page === 'penjualan' && (
          <>
            <section className="panel">
              <h3 className="panel-title">Buat Transaksi Baru</h3>
              <form onSubmit={handleSavePenjualan}>
                <div className="form-grid">
                  <div className="field"><label>Produk *</label><select name="produk_id" value={penjualanForm.produk_id} onChange={updatePenjualanForm} required><option value="">Pilih produk</option>{products.map(p => (<option key={p.id} value={p.id}>{p.nama_produk} - Stok: {p.stok} - {rupiah(p.harga_jual)}</option>))}</select>{selectedProductForSale && (<span className="muted" style={{marginTop:6, display:'block'}}>Stok: {selectedProductForSale.stok} | Modal: {rupiah(selectedProductForSale.harga_modal)} | Jual: {rupiah(selectedProductForSale.harga_jual)} | Profit: {rupiah(Number(selectedProductForSale.harga_jual||0)-Number(selectedProductForSale.harga_modal||0))}/pcs</span>)}</div>
                  <div className="field"><label>Jumlah *</label><input name="jumlah" type="number" min="1" value={penjualanForm.jumlah} onChange={updatePenjualanForm} required /></div>
                  <div className="field"><label>Metode Pembayaran</label><select name="metode_pembayaran" value={penjualanForm.metode_pembayaran} onChange={updatePenjualanForm}><option value="Tunai">Tunai</option><option value="Transfer">Transfer</option><option value="QRIS">QRIS</option><option value="Debit">Debit</option></select></div>
                  <div className="field"><label>Preview</label><div>Total: <strong>{rupiah(previewTotal)}</strong></div><div>Modal: {rupiah(previewModal)}</div><div style={{color:'#16a34a', fontWeight:'bold'}}>Profit: {rupiah(previewProfit)}</div></div>
                </div>
                <div style={{ marginTop: 20 }}><button className="button button-primary" type="submit" disabled={savingPenjualan}>{savingPenjualan ? 'Memproses...' : 'Simpan & Cetak Struk'}</button></div>
              </form>
            </section>

            {selectedNota && (
              <section className="panel" style={{border:'2px solid #2d4a3a'}}>
                <h3 className="panel-title">Struk Terakhir Berhasil - Siap Cetak</h3>
                <div style={{background:'#f9f9f7', padding:16, borderRadius:8, fontFamily:'monospace'}}>
                  <div style={{textAlign:'center'}}><strong>THENARA BOUTIQUE</strong><br/>No: {String(selectedNota.saleId).slice(0,8).toUpperCase()} | {new Date(selectedNota.tanggal).toLocaleString('id-ID')}</div>
                  <hr style={{borderTop:'1px dashed'}}/>
                  <div>{selectedNota.nama_produk}</div>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span>{selectedNota.jumlah} x {rupiah(selectedNota.harga_jual)}</span><span>{rupiah(selectedNota.total)}</span></div>
                  <hr style={{borderTop:'1px dashed'}}/>
                  <div style={{display:'flex', justifyContent:'space-between', fontWeight:'bold'}}><span>TOTAL</span><span>{rupiah(selectedNota.total)}</span></div>
                  <div style={{marginTop:12, display:'flex', gap:8}}>
                    <button className="button button-primary" onClick={() => handlePrintNota(selectedNota)}>🖨️ Cetak Struk / Simpan PDF</button>
                    <button className="button button-secondary" onClick={() => setSelectedNota(null)}>Tutup</button>
                  </div>
                </div>
              </section>
            )}

            <section className="panel">
              <h3 className="panel-title" style={{ marginBottom: 18 }}>Riwayat Penjualan ({saleDetails.length > 0 ? saleDetails.length : sales.length})</h3>
              <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Produk</th><th>Qty</th><th>Total</th><th>Profit</th><th>Metode</th><th>Aksi</th></tr></thead><tbody>
                {saleDetails.length > 0 ? saleDetails.map((item) => (
                  <tr key={item.saleId}><td>{new Date(item.tanggal).toLocaleString('id-ID')}</td><td>{item.nama_produk}</td><td>{item.jumlah}</td><td>{rupiah(item.total)}</td><td style={{color:'#16a34a'}}>{rupiah(item.profit)}</td><td>{item.metode}</td><td><button className="button button-secondary" style={{padding:'4px 8px', fontSize:12}} onClick={() => handlePrintNota(item)}>Cetak</button></td></tr>
                )) : sales.map((item) => (
                  <tr key={item.id}><td>{item.tanggal_penjualan ? new Date(item.tanggal_penjualan).toLocaleString('id-ID') : '-'}</td><td>-</td><td>-</td><td>{rupiah(item.total_penjualan)}</td><td>-</td><td>{item.metode_pembayaran || '-'}</td><td>-</td></tr>
                ))}
              </tbody></table>{sales.length === 0 && (<div className="empty-state">Belum ada data penjualan.</div>)}</div>
            </section>
          </>
        )}

        {page === 'laporan' && (
          <>
            <section className="stats-grid">
              <div className="stat-card"><div className="stat-label">Total Omzet Penjualan</div><div className="stat-value">{rupiah(totalPenjualan)}</div><div className="muted" style={{marginTop:8}}>Dari {saleDetails.length} transaksi</div></div>
              <div className="stat-card"><div className="stat-label">Total Modal Terjual</div><div className="stat-value">{rupiah(totalModalTerjual)}</div></div>
              <div className="stat-card" style={{background:'#f0fdf4', border:'1px solid #16a34a'}}><div className="stat-label" style={{color:'#16a34a'}}>Total Keuntungan Bersih</div><div className="stat-value" style={{color:'#16a34a'}}>{rupiah(totalProfit)}</div><div className="muted">Margin: {totalPenjualan>0 ? ((totalProfit/totalPenjualan)*100).toFixed(1) : 0}%</div></div>
              <div className="stat-card"><div className="stat-label">Nilai Stok Tersisa</div><div className="stat-value">{rupiah(totalNilaiStok)}</div><div className="muted">Aset toko saat ini</div></div>
            </section>
            <section className="panel">
              <h3 className="panel-title">Laporan Profit Per Produk</h3>
              <div className="table-wrap"><table><thead><tr><th>Nama Produk</th><th>Qty Terjual</th><th>Omzet</th><th>Modal</th><th>Profit</th></tr></thead><tbody>
                {Object.values(saleDetails.reduce((acc, d) => {
                  if (!acc[d.nama_produk]) acc[d.nama_produk] = { nama: d.nama_produk, qty:0, omzet:0, modal:0, profit:0 }
                  acc[d.nama_produk].qty += d.jumlah
                  acc[d.nama_produk].omzet += d.total
                  acc[d.nama_produk].modal += d.modalTotal
                  acc[d.nama_produk].profit += d.profit
                  return acc
                }, {})).map((row) => (
                  <tr key={row.nama}><td>{row.nama}</td><td>{row.qty}</td><td>{rupiah(row.omzet)}</td><td>{rupiah(row.modal)}</td><td style={{color:'#16a34a', fontWeight:'bold'}}>{rupiah(row.profit)}</td></tr>
                ))}
              </tbody></table>{saleDetails.length===0 && <div className="empty-state">Belum ada penjualan untuk laporan. Data laporan mulai tercatat setelah pakai versi ini.</div>}</div>
              <div style={{marginTop:16}}><button className="button button-secondary" onClick={() => window.print()}>🖨️ Cetak Laporan / Simpan PDF</button></div>
            </section>
            <section className="panel">
              <h3 className="panel-title">Cara Deploy ke HP (Gratis)</h3>
              <div style={{lineHeight:1.8}}>
                <p><strong>Supabase & Vercel 100% Gratis untuk THENARA</strong></p>
                <ol>
                  <li>Push kode THENARA ke GitHub (buat repo baru `thenara-boutique`)</li>
                  <li>Buka vercel.com → Login pakai GitHub → New Project → Import `thenara-boutique`</li>
                  <li>Di Vercel, tambahkan Environment Variables dari file `.env` lu (VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY)</li>
                  <li>Klik Deploy → selesai, dapat link https://thenara-boutique.vercel.app</li>
                  <li>Buka link itu di HP toko → Login → Tap titik 3 di Chrome → Add to Home Screen → Jadi aplikasi!</li>
                </ol>
                <p className="muted">Mau gw bikinin panduan video deploy step-by-step?</p>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function ProductTable({ products }) {
  return (
    <div className="table-wrap">
      <table><thead><tr><th>Nama Produk</th><th>Harga Modal</th><th>Harga Jual</th><th>Stok</th><th>Profit/pcs</th></tr></thead><tbody>{products.map((item) => (<tr key={item.id}><td>{item.nama_produk}</td><td>{rupiah(item.harga_modal)}</td><td>{rupiah(item.harga_jual)}</td><td>{item.stok ?? 0}</td><td style={{color:'#16a34a'}}>{rupiah(Number(item.harga_jual||0)-Number(item.harga_modal||0))}</td></tr>))}</tbody></table>
      {products.length === 0 && (<div className="empty-state">Belum ada produk yang dapat ditampilkan.</div>)}
    </div>
  )
}
