// script.js
// Scenario launcher / schedule table
//
// For dual-monitor setups:
// - Use the "Delivery View" link on one monitor and the "Imaging View" link on the other.
// - Both views point to the SAME scenario file so data are consistent.

const scenarios = [
  {
    id: 'A0',
    label: 'A0 – Femur (Palliation) – 0 discrepancies',
    time: '08:00 AM',
    file: 'data/A0.json'
  },
  {
    id: 'A1',
    label: 'A1 – Left Breast – 1 discrepancy',
    time: '08:20 AM',
    file: 'data/A1.json'
  },
  {
    id: 'A2',
    label: 'A2 – Pelvis/Prostate – 2 discrepancies',
    time: '08:40 AM',
    file: 'data/A2.json'
  },
  {
    id: 'B0',
    label: 'B0 – Skeletal Spine – 0 discrepancies',
    time: '09:00 AM',
    file: 'data/B0.json'
  },
  {
    id: 'B1',
    label: 'B1 – Left Breast – 1 discrepancy',
    time: '09:20 AM',
    file: 'data/B1.json'
  },
  {
    id: 'B2',
    label: 'B2 – Pelvis/Prostate – 2 discrepancies',
    time: '09:40 AM',
    file: 'data/B2.json'
  }
];

function createLink(href, text, className = 'view-link') {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  a.className = className;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

function createButton(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'secondary';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function openBothViews(file) {
  // Note: modern browsers may block pop-ups unless user-initiated.
  window.open(`patient.html?file=${encodeURIComponent(file)}&view=delivery`, '_blank', 'noopener');
  window.open(`patient.html?file=${encodeURIComponent(file)}&view=imaging`, '_blank', 'noopener');
}

function populateSchedule() {
  const scheduleBody = document.querySelector('#schedule-body');
  if (!scheduleBody) return;

  scheduleBody.innerHTML = '';

  scenarios.forEach((s) => {
    const row = document.createElement('tr');

    const timeCell = document.createElement('td');
    timeCell.textContent = s.time;
    row.appendChild(timeCell);

    const patientCell = document.createElement('td');
    patientCell.textContent = s.label;
    row.appendChild(patientCell);

    const actionCell = document.createElement('td');
    actionCell.className = 'actions-cell';

    const delivery = createLink(`patient.html?file=${encodeURIComponent(s.file)}&view=delivery`, 'Delivery View');
    const imaging = createLink(`patient.html?file=${encodeURIComponent(s.file)}&view=imaging`, 'Imaging View');
    const bothBtn = createButton('Open Both', () => openBothViews(s.file));

    actionCell.appendChild(delivery);
    actionCell.appendChild(imaging);
    actionCell.appendChild(bothBtn);

    row.appendChild(actionCell);

    scheduleBody.appendChild(row);
  });
}

document.addEventListener('DOMContentLoaded', populateSchedule);
