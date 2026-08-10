'use client';

import { useState, useEffect } from 'react';
import { db, formatARS } from '@/lib/db';
import type { MedicalConsultation } from '@/lib/db';
import { Modal } from '@/components/Modal';

export default function MedicoPage() {
  const [consultations, setConsultations] = useState<MedicalConsultation[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [specialty, setSpecialty] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [cost, setCost] = useState('');
  const [nextVisit, setNextVisit] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const items = await db.medical_consultations.orderBy('date').reverse().toArray();
    setConsultations(items);
  };

  const handleAdd = async () => {
    if (!specialty) return;
    const costNum = parseFloat(cost) || 0;

    let expenseId: number | undefined;
    if (costNum > 0) {
      const cats = await db.categories.toArray();
      const saludCat = cats.find(c => c.name === 'Salud') || cats[0];
      const subs = await db.subcategories.where('category_id').equals(saludCat?.id || 1).toArray();
      const expId = await db.expenses.add({
        date, amount: costNum,
        detail: `Consulta ${specialty}${doctorName ? ' - Dr. ' + doctorName : ''}`,
        category_id: saludCat?.id || 1,
        subcategory_id: subs[0]?.id || 1,
        status: 'active', module_origin: 'medical',
      });
      expenseId = expId as number;
    }

    await db.medical_consultations.add({
      date, specialty, doctor_name: doctorName,
      cost: costNum, has_cost: costNum > 0 ? 1 : 0,
      next_visit_date: nextVisit || undefined,
      notes, status: 'completed', expense_id: expenseId,
      created_at: new Date().toISOString(),
    });

    setSpecialty(''); setDoctorName(''); setCost(''); setNextVisit(''); setNotes('');
    setShowAdd(false);
    loadData();
  };

  const SPECIALTIES = ['Clínica', 'Cardiología', 'Traumatología', 'Oftalmología', 'Odontología', 'Dermatología', 'Psicología', 'Ginecología', 'Pediatría', 'Otra'];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">🏥 Médico</h1>
          <p className="page-subtitle">{consultations.length} consultas registradas</p>
        </div>
        <button id="add-consultation-btn" className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Nueva</button>
      </div>

      {consultations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏥</div>
          <p className="empty-state-text">No hay consultas registradas</p>
        </div>
      ) : (
        <div className="card">
          {consultations.map(c => (
            <div key={c.id} className="list-item">
              <div className="list-item-icon" style={{ background: '#10B98122' }}>🏥</div>
              <div className="list-item-body">
                <div className="list-item-title">{c.specialty}{c.doctor_name ? ` — Dr. ${c.doctor_name}` : ''}</div>
                <div className="list-item-subtitle">
                  {c.date}
                  {c.next_visit_date && <span style={{ color: 'var(--warning)' }}> · Próxima: {c.next_visit_date}</span>}
                </div>
              </div>
              <div className="list-item-right">
                {c.cost && c.cost > 0 ? (
                  <div className="list-item-amount amount-negative">{formatARS(c.cost)}</div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--positive)' }}>Sin costo</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Nueva Consulta Médica">
        <div className="form-group">
          <label className="form-label">Especialidad</label>
          <div className="chips-row">
            {SPECIALTIES.map(s => (
              <button key={s} className={`chip${specialty === s ? ' active' : ''}`} onClick={() => setSpecialty(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Nombre del médico (opcional)</label>
          <input id="doctor-name" className="form-input" value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="Dr. Apellido" />
        </div>
        <div className="form-group">
          <label className="form-label">Fecha de consulta</label>
          <input id="consult-date" className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Costo ($) — dejar en 0 si no tiene costo</label>
          <input id="consult-cost" className="form-input" type="number" value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">Próxima visita (opcional)</label>
          <input id="next-visit" className="form-input" type="date" value={nextVisit} onChange={e => setNextVisit(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Notas</label>
          <textarea id="consult-notes" className="form-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Diagnóstico, medicación, observaciones..." rows={3} />
        </div>
        <button id="save-consult-btn" className="btn btn-primary" onClick={handleAdd} disabled={!specialty}>💾 Guardar consulta</button>
      </Modal>
    </>
  );
}
