#!/usr/bin/env node
// Backfill goal events with minutes from openfootball/worldcup.json data
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const matchesPath = resolve(__dirname, '../copa/data/matches.json');

// Data from https://github.com/openfootball/worldcup.json (public domain)
const openfootball = [
  { home: "México", away: "África do Sul", goals1: [{name:"Julián Quiñones",min:"9'"},{name:"Raúl Jiménez",min:"67'"}], goals2: [] },
  { home: "Coreia do Sul", away: "Tchéquia", goals1: [{name:"Hwang In-Beom",min:"67'"},{name:"Oh Hyeon-Gyu",min:"80'"}], goals2: [{name:"Ladislav Krejcí",min:"59'"}] },
  { home: "Tchéquia", away: "África do Sul", goals1: [{name:"Michal Sadílek",min:"6'"}], goals2: [{name:"Teboho Mokoena",min:"83'",detail:"pen."}] },
  { home: "México", away: "Coreia do Sul", goals1: [{name:"Luis Romo",min:"50'"}], goals2: [] },
  { home: "Canadá", away: "Bósnia e Herzegovina", goals1: [{name:"Cyle Larin",min:"78'"}], goals2: [{name:"Jovo Lukić",min:"21'"}] },
  { home: "Catar", away: "Suíça", goals1: [{name:"Miro Muheim",min:"90+4'",detail:"gol contra"}], goals2: [{name:"Breel Embolo",min:"17'",detail:"pen."}] },
  { home: "Suíça", away: "Bósnia e Herzegovina", goals1: [{name:"Johan Manzambi",min:"74'"},{name:"Rubén Vargas",min:"84'"},{name:"Johan Manzambi",min:"90'"},{name:"Granit Xhaka",min:"90+7'",detail:"pen."}], goals2: [{name:"Ermin Mahmic",min:"90+3'"}] },
  { home: "Canadá", away: "Catar", goals1: [{name:"Cyle Larin",min:"16'"},{name:"Jonathan David",min:"29'"},{name:"Jonathan David",min:"45+3'"},{name:"Nathan Saliba",min:"64'"},{name:"Mohamed Manai",min:"75'",detail:"gol contra"},{name:"Jonathan David",min:"90+2'"}], goals2: [] },
  { home: "Brasil", away: "Marrocos", goals1: [{name:"Vinícius Júnior",min:"32'"}], goals2: [{name:"Ismael Saibari",min:"21'"}] },
  { home: "Haiti", away: "Escócia", goals1: [], goals2: [{name:"John McGinn",min:"28'"}] },
  { home: "Escócia", away: "Marrocos", goals1: [], goals2: [{name:"Ismael Saibari",min:"2'"}] },
  { home: "Brasil", away: "Haiti", goals1: [{name:"Matheus Cunha",min:"23'"},{name:"Matheus Cunha",min:"36'"},{name:"Vinícius Júnior",min:"45+3'"}], goals2: [] },
  { home: "Estados Unidos", away: "Paraguai", goals1: [{name:"Damian Bobadilla",min:"7'",detail:"gol contra"},{name:"Folarin Balogun",min:"31'"},{name:"Folarin Balogun",min:"45+5'"},{name:"Giovanni Reyna",min:"90+8'"}], goals2: [{name:"Mauricio",min:"73'"}] },
  { home: "Austrália", away: "Turquia", goals1: [{name:"Nestory Irankunda",min:"27'"},{name:"Connor Metcalfe",min:"75'"}], goals2: [] },
  { home: "Estados Unidos", away: "Austrália", goals1: [{name:"Cameron Burgess",min:"11'",detail:"gol contra"},{name:"Alex Freeman",min:"43'"}], goals2: [] },
  { home: "Turquia", away: "Paraguai", goals1: [], goals2: [{name:"Matías Galarza",min:"2'"}] },
  { home: "Alemanha", away: "Curaçao", goals1: [{name:"Felix Nmecha",min:"6'"},{name:"Nico Schlotterbeck",min:"38'"},{name:"Kai Havertz",min:"45+5'",detail:"pen."},{name:"Jamal Musiala",min:"47'"},{name:"Nathaniel Brown",min:"68'"},{name:"Deniz Undav",min:"78'"},{name:"Kai Havertz",min:"88'"}], goals2: [{name:"Livano Comenencia",min:"21'"}] },
  { home: "Costa do Marfim", away: "Equador", goals1: [{name:"Amad Diallo",min:"90'"}], goals2: [] },
  { home: "Países Baixos", away: "Japão", goals1: [{name:"Virgil van Dijk",min:"51'"},{name:"Crysencio Summerville",min:"64'"}], goals2: [{name:"Keito Nakamura",min:"57'"},{name:"Daichi Kamada",min:"88'"}] },
  { home: "Suécia", away: "Tunísia", goals1: [{name:"Yasin Ayari",min:"7'"},{name:"Alexander Isak",min:"30'"},{name:"Viktor Gyökeres",min:"59'"},{name:"Mattias Svanberg",min:"84'"},{name:"Yasin Ayari",min:"90+6'"}], goals2: [{name:"Omar Rekik",min:"43'"}] },
  { home: "Bélgica", away: "Egito", goals1: [{name:"Mohamed Hany",min:"66'",detail:"gol contra"}], goals2: [{name:"Emam Ashour",min:"19'"}] },
  { home: "Irã", away: "Nova Zelândia", goals1: [{name:"Ramin Rezaeian",min:"32'"},{name:"Mohammad Mohebbi",min:"64'"}], goals2: [{name:"Elijah Just",min:"7'"},{name:"Elijah Just",min:"54'"}] },
  { home: "Espanha", away: "Cabo Verde", goals1: [], goals2: [] },
  { home: "Arábia Saudita", away: "Uruguai", goals1: [{name:"Abdulelah Al-Amri",min:"41'"}], goals2: [{name:"Maxi Araújo",min:"80'"}] },
  { home: "França", away: "Senegal", goals1: [{name:"Kylian Mbappé",min:"66'"},{name:"Bradley Barcola",min:"82'"},{name:"Kylian Mbappé",min:"90+6'"}], goals2: [{name:"Ibrahim Mbaye",min:"90+5'"}] },
  { home: "Iraque", away: "Noruega", goals1: [{name:"Aymen Hussein",min:"39'"}], goals2: [{name:"Erling Haaland",min:"29'"},{name:"Erling Haaland",min:"43'"},{name:"Leo Østigard",min:"76'"},{name:"Aymen Hussein",min:"90+6'",detail:"gol contra"}] },
  { home: "Argentina", away: "Argélia", goals1: [{name:"Lionel Messi",min:"17'"},{name:"Lionel Messi",min:"60'"},{name:"Lionel Messi",min:"76'"}], goals2: [] },
  { home: "Áustria", away: "Jordânia", goals1: [{name:"Romano Schmid",min:"21'"},{name:"Yazan Al-Arab",min:"76'",detail:"gol contra"},{name:"Marko Arnautovic",min:"90+12'",detail:"pen."}], goals2: [{name:"Ali Olwan",min:"50'"}] },
  { home: "Portugal", away: "RD Congo", goals1: [{name:"João Neves",min:"6'"}], goals2: [{name:"Yoane Wissa",min:"45+5'"}] },
  { home: "Uzbequistão", away: "Colômbia", goals1: [{name:"Abbosbek Fayzullaev",min:"60'"}], goals2: [{name:"Daniel Muñoz",min:"40'"},{name:"Luis Díaz",min:"65'"},{name:"Jáminton Campaz",min:"90+9'"}] },
  { home: "Inglaterra", away: "Croácia", goals1: [{name:"Harry Kane",min:"12'",detail:"pen."},{name:"Harry Kane",min:"42'"},{name:"Jude Bellingham",min:"47'"},{name:"Marcus Rashford",min:"85'"}], goals2: [{name:"Martin Baturina",min:"36'"},{name:"Petar Musa",min:"45+5'"}] },
  { home: "Gana", away: "Panamá", goals1: [{name:"Caleb Yirenkyi",min:"90+5'"}], goals2: [] },
];

function parseMinute(min) {
  const m = min.match(/^(\d+)(?:\+(\d+))?/);
  if (!m) return 999;
  return Number(m[1]) + (m[2] ? Number(m[2]) : 0);
}

function getPeriod(min) {
  const n = parseMinute(min);
  if (n <= 45) return 1;
  if (n <= 90) return 2;
  if (n <= 120) return 3;
  return 4;
}

const data = JSON.parse(readFileSync(matchesPath, 'utf8'));
let updated = 0;

for (const m of data.groupStage) {
  if (m.status !== 'finished') continue;

  const entry = openfootball.find(o => o.home === m.home && o.away === m.away);
  if (!entry) {
    console.log(`  ✗ No data for M${m.id}: ${m.home} vs ${m.away}`);
    continue;
  }

  const events = [];

  for (const g of entry.goals1) {
    events.push({
      type: 'goal', player: g.name, team: m.home,
      minute: g.min, period: getPeriod(g.min),
      detail: g.detail || ''
    });
  }
  for (const g of entry.goals2) {
    events.push({
      type: 'goal', player: g.name, team: m.away,
      minute: g.min, period: getPeriod(g.min),
      detail: g.detail || ''
    });
  }

  events.sort((a, b) => parseMinute(a.minute) - parseMinute(b.minute));

  if (events.length > 0) {
    m.events = events;
    updated++;
    console.log(`  ✓ M${m.id}: ${m.home} vs ${m.away} — ${events.length} events`);
  }
}

writeFileSync(matchesPath, JSON.stringify(data, null, 2) + '\n');
console.log(`\nDone. Updated ${updated} matches with goal events.`);
