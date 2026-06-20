#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const matchesPath = resolve(__dirname, '../copa/data/matches.json');

const cardData = [
  { home: "México", away: "África do Sul", cards: [
    {player:"Sphephelo Sithole",team:"África do Sul",type:"red",minute:"49'"},
    {player:"Themba Zwane",team:"África do Sul",type:"red",minute:"84'"},
    {player:"César Montes",team:"México",type:"red",minute:"90+2'"},
  ]},
  { home: "Coreia do Sul", away: "Tchéquia", cards: [
    {player:"Lee Gi-hyuk",team:"Coreia do Sul",type:"yellow",minute:"90+6'"},
  ]},
  { home: "Tchéquia", away: "África do Sul", cards: [
    {player:"Teboho Mokoena",team:"África do Sul",type:"yellow",minute:"32'"},
    {player:"Thalente Mbatha",team:"África do Sul",type:"yellow",minute:"39'"},
    {player:"Ladislav Krejčí",team:"Tchéquia",type:"yellow",minute:"75'"},
  ]},
  { home: "México", away: "Coreia do Sul", cards: [
    {player:"Lee Kang-in",team:"Coreia do Sul",type:"yellow",minute:"4'"},
  ]},
  { home: "Canadá", away: "Bósnia e Herzegovina", cards: [
    {player:"Katic",team:"Bósnia e Herzegovina",type:"yellow",minute:"90+3'"},
  ]},
  { home: "Catar", away: "Suíça", cards: [
    {player:"Jassem Gaber Abdulsallam",team:"Catar",type:"yellow",minute:"22'"},
    {player:"Denis Zakaria",team:"Suíça",type:"yellow",minute:"42'"},
  ]},
  { home: "Suíça", away: "Bósnia e Herzegovina", cards: [
    {player:"Tarik Muharemović",team:"Bósnia e Herzegovina",type:"red",minute:"80'"},
  ]},
  { home: "Canadá", away: "Catar", cards: [
    {player:"Homam Ahmed",team:"Catar",type:"red",minute:"33'"},
    {player:"Assim Madibo",team:"Catar",type:"red",minute:"53'"},
  ]},
  { home: "Brasil", away: "Marrocos", cards: [
    {player:"Casemiro",team:"Brasil",type:"yellow",minute:"37'"},
    {player:"Roger Ibañez",team:"Brasil",type:"yellow",minute:"43'"},
  ]},
  { home: "Haiti", away: "Escócia", cards: [
    {player:"Kenny McLean",team:"Escócia",type:"yellow",minute:"90+5'"},
  ]},
  { home: "Escócia", away: "Marrocos", cards: [
    {player:"Issa Diop",team:"Marrocos",type:"yellow",minute:"23'"},
    {player:"Andy Robertson",team:"Escócia",type:"yellow",minute:"65'"},
  ]},
  { home: "Brasil", away: "Haiti", cards: [
    {player:"Frantzdy Pierrot",team:"Haiti",type:"yellow",minute:"45+4'"},
  ]},
  { home: "Estados Unidos", away: "Paraguai", cards: [
    {player:"Juan José Cáceres",team:"Paraguai",type:"yellow",minute:"10'"},
  ]},
  { home: "Austrália", away: "Turquia", cards: [
    {player:"Yunus Akgün",team:"Turquia",type:"yellow",minute:"86'"},
  ]},
  { home: "Estados Unidos", away: "Austrália", cards: [
    {player:"Jordan Bos",team:"Austrália",type:"yellow",minute:"16'"},
    {player:"Alessandro Circati",team:"Austrália",type:"yellow",minute:"32'"},
    {player:"Antonee Robinson",team:"Estados Unidos",type:"yellow",minute:"56'"},
    {player:"Folarin Balogun",team:"Estados Unidos",type:"yellow",minute:"89'"},
    {player:"Chris Richards",team:"Estados Unidos",type:"yellow",minute:"90+3'"},
  ]},
  { home: "Turquia", away: "Paraguai", cards: [
    {player:"Miguel Almirón",team:"Paraguai",type:"red",minute:"45'"},
  ]},
  { home: "Costa do Marfim", away: "Equador", cards: [
    {player:"Seko Fofana",team:"Costa do Marfim",type:"yellow",minute:"28'"},
  ]},
  { home: "Suécia", away: "Tunísia", cards: [
    {player:"Rani Khedira",team:"Tunísia",type:"yellow",minute:"54'"},
  ]},
  { home: "Bélgica", away: "Egito", cards: [
    {player:"Marwan Attia",team:"Egito",type:"yellow",minute:"12'"},
    {player:"Timothy Castagne",team:"Bélgica",type:"yellow",minute:"14'"},
    {player:"Ahmed Fatouh",team:"Egito",type:"yellow",minute:"33'"},
    {player:"Maxim De Cuyper",team:"Bélgica",type:"yellow",minute:"75'"},
  ]},
  { home: "Espanha", away: "Cabo Verde", cards: [
    {player:"Steven Lopes Cabral",team:"Cabo Verde",type:"yellow",minute:"16'"},
    {player:"Pedri",team:"Espanha",type:"yellow",minute:"90+3'"},
  ]},
  { home: "Arábia Saudita", away: "Uruguai", cards: [
    {player:"Abdulelah Al-Amri",team:"Arábia Saudita",type:"yellow",minute:"44'"},
  ]},
  { home: "Áustria", away: "Jordânia", cards: [
    {player:"Marcel Sabitzer",team:"Áustria",type:"yellow",minute:"77'"},
  ]},
  { home: "Portugal", away: "RD Congo", cards: [
    {player:"Bernardo Silva",team:"Portugal",type:"yellow",minute:"13'"},
    {player:"Chancel Mbemba",team:"RD Congo",type:"yellow",minute:"32'"},
    {player:"Nélson Semedo",team:"Portugal",type:"yellow",minute:"88'"},
  ]},
  { home: "Uzbequistão", away: "Colômbia", cards: [
    {player:"Johan Mojica",team:"Colômbia",type:"yellow",minute:"7'"},
    {player:"Abdukodir Khusanov",team:"Uzbequistão",type:"yellow",minute:"34'"},
    {player:"Daniel Muñoz",team:"Colômbia",type:"yellow",minute:"40'"},
  ]},
  { home: "Gana", away: "Panamá", cards: [
    {player:"Caleb Yirenkyi",team:"Gana",type:"yellow",minute:"16'"},
    {player:"César Blackman",team:"Panamá",type:"yellow",minute:"72'"},
    {player:"Carlos Harvey",team:"Panamá",type:"yellow",minute:"90+9'"},
  ]},
];

function parseMinute(min) {
  const m = String(min).match(/^(\d+)(?:\+(\d+))?/);
  if (!m) return 999;
  return Number(m[1]) + (m[2] ? Number(m[2]) : 0);
}

function getPeriod(min) {
  const base = parseInt(String(min), 10) || 0;
  if (base <= 45) return 1;
  if (base <= 90) return 2;
  if (base <= 120) return 3;
  return 4;
}

const data = JSON.parse(readFileSync(matchesPath, 'utf8'));
let updated = 0;

for (const m of data.groupStage) {
  if (m.status !== 'finished') continue;

  const entry = cardData.find(c => c.home === m.home && c.away === m.away);
  if (!entry || entry.cards.length === 0) continue;

  if (!m.events) m.events = [];

  for (const c of entry.cards) {
    m.events.push({
      type: c.type,
      player: c.player,
      team: c.team,
      minute: c.minute,
      period: getPeriod(c.minute),
      detail: ''
    });
  }

  m.events.sort((a, b) => parseMinute(a.minute) - parseMinute(b.minute));
  updated++;
  console.log(`  ✓ M${m.id}: ${m.home} vs ${m.away} — +${entry.cards.length} cards`);
}

writeFileSync(matchesPath, JSON.stringify(data, null, 2) + '\n');
console.log(`\nDone. Added cards to ${updated} matches.`);
