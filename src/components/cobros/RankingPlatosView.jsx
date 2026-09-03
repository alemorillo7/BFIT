import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, 
  Medal, 
  Award, 
  Utensils, 
  TrendingUp, 
  Clock, 
  Filter, 
  Calendar, 
  Sparkles, 
  ThumbsUp, 
  AlertCircle, 
  RefreshCw,
  Search,
  CheckCircle2,
  ChevronRight,
  Flame,
  PieChart,
  HelpCircle,
  GraduationCap
} from 'lucide-react';
import { fetchSheetData } from '../../services/dataService';
import './RankingPlatosView.css';

export default function RankingPlatosView({
  allMonthData,
  selectedMonth,
  onChangeMonth,
  monthsList,
  monthLabel,
  turnsList,
  workingDays
}) {
  const [selectedTurn, setSelectedTurn] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL'); // 'ALL' | 'TRADICIONAL' | 'FIT' | 'ALTERNATIVO'
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [cambiosData, setCambiosData] = useState([]);
  const [menuTradicionalData, setMenuTradicionalData] = useState([]);
  const [menuFitData, setMenuFitData] = useState([]);
  const [platosAlternativosData, setPlatosAlternativosData] = useState([]);

  // Load complementary sheets data
  useEffect(() => {
    let isMounted = true;
    const loadComplementaryData = async () => {
      setLoadingSheets(true);
      try {
        const [cambios, menuTrad, menuFit, alternativos] = await Promise.allSettled([
          fetchSheetData('Registros_Cambios'),
          fetchSheetData('Menu_Tradicional'),
          fetchSheetData('Menu_Fit'),
          fetchSheetData('Platos_Alternativos')
        ]);

        if (isMounted) {
          if (cambios.status === 'fulfilled') setCambiosData(cambios.value || []);
          if (menuTrad.status === 'fulfilled') setMenuTradicionalData(menuTrad.value || []);
          if (menuFit.status === 'fulfilled') setMenuFitData(menuFit.value || []);
          if (alternativos.status === 'fulfilled') setPlatosAlternativosData(alternativos.value || []);
        }
      } catch (err) {
        console.warn('Error loading complementary menu data:', err);
      } finally {
        if (isMounted) setLoadingSheets(false);
      }
    };

    loadComplementaryData();
    return () => { isMounted = false; };
  }, [selectedMonth]);

  // Aggregate dish consumption and popularity
  const rankingAnalysis = useMemo(() => {
    const dishCounts = new Map(); // dishName -> { name, count, turns: {}, courses: {}, category, changeCount }

    const ensureDish = (name, category = 'TRADICIONAL') => {
      const cleanName = String(name || '').trim();
      if (!cleanName) return null;
      const key = cleanName.toUpperCase();
      if (!dishCounts.has(key)) {
        dishCounts.set(key, {
          name: cleanName,
          key,
          count: 0,
          turns: { '11:50': 0, '11:25': 0, '12:00': 0, '12:40': 0, '13:05': 0 },
          courses: {},
          category: category,
          changeRequests: 0
        });
      }
      return dishCounts.get(key);
    };

    // 1. Seed base dishes from Menu Tradicional
    menuTradicionalData.forEach(m => {
      const plato = m.segundo || m.sopa || m.guarnicion;
      if (plato && plato.length > 2) {
        ensureDish(plato, 'TRADICIONAL');
      }
    });

    // 2. Seed base dishes from Menu Fit
    menuFitData.forEach(m => {
      const plato = m.segundo;
      if (plato && plato.length > 2) {
        ensureDish(`${plato} (FIT)`, 'FIT');
      }
    });

    // 3. Seed Alternative Dishes catalogue
    platosAlternativosData.forEach(p => {
      const plato = p.nombre;
      if (plato && plato.length > 2) {
        ensureDish(plato, 'ALTERNATIVO');
      }
    });

    // Filter change requests strictly for the selected month (e.g. '2026-09')
    const monthCambios = cambiosData.filter(c => {
      if (!c.fecha) return true;
      const f = String(c.fecha).trim();
      const [yearStr, monthStr] = selectedMonth.split('-');
      return f.includes(selectedMonth) || (f.includes(`-${monthStr}-`) && f.includes(yearStr)) || f.includes(`/${monthStr}/`);
    });

    // 1. Build a daily menu lookup for this specific month's working days
    const dayNamesMap = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes' };
    const dailyScheduledDishes = {}; // dayKey -> { trad, fit }

    workingDays.forEach(wd => {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const date = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, wd.dayNum);
      const dayOfWeek = date.getDay(); // 1 = Mon, 5 = Fri
      const dayName = dayNamesMap[dayOfWeek] || '';
      const weekNumber = String(Math.min(4, Math.max(1, Math.ceil(wd.dayNum / 7))));

      // Find scheduled traditional menu
      const matchTrad = menuTradicionalData.find(m => 
        String(m.semana || '').includes(weekNumber) && 
        String(m.dia || '').toLowerCase().includes(dayName.toLowerCase())
      );
      const tradDish = matchTrad ? (matchTrad.segundo || matchTrad.sopa || matchTrad.guarnicion) : null;

      // Find scheduled fit menu
      const matchFit = menuFitData.find(m => 
        String(m.semana || '').includes(weekNumber) && 
        String(m.dia || '').toLowerCase().includes(dayName.toLowerCase())
      );
      const fitDish = matchFit ? matchFit.segundo : null;

      dailyScheduledDishes[wd.key] = {
        trad: tradDish,
        fit: fitDish
      };

      if (tradDish) ensureDish(tradDish, 'TRADICIONAL');
      if (fitDish) ensureDish(`${fitDish} (FIT)`, 'FIT');
    });

    // 2. Count actual student plate consumptions from Cobros spreadsheet for selectedMonth
    allMonthData.forEach(student => {
      const studentTurn = student.turno || '11:50';
      const studentCourse = student.curso || 'General';

      if (student.asistencias) {
        workingDays.forEach(wd => {
          const val = student.asistencias[wd.key];
          const sVal = String(val || '').trim().toUpperCase();

          // If student attended and consumed lunch (not absent 'F' or '0')
          if (sVal && sVal !== '0' && sVal !== 'F') {
            const plateQty = isNaN(Number(sVal)) ? 1 : Number(sVal);
            const noteKey = `${wd.key}_nota`;
            const specificNote = student.asistencias[noteKey];

            if (specificNote && String(specificNote).trim()) {
              // Custom requested dish/diet
              const noteText = String(specificNote).trim();
              const isFit = noteText.toUpperCase().includes('FIT');
              const entry = ensureDish(noteText, isFit ? 'FIT' : 'ALTERNATIVO');
              if (entry) {
                entry.count += plateQty;
                entry.turns[studentTurn] = (entry.turns[studentTurn] || 0) + plateQty;
                entry.courses[studentCourse] = (entry.courses[studentCourse] || 0) + plateQty;
              }
            } else {
              // Standard scheduled dish for that day of the month
              const scheduled = dailyScheduledDishes[wd.key];
              const dishName = scheduled?.trad || `Menú del Día (${wd.label})`;
              const entry = ensureDish(dishName, 'TRADICIONAL');
              if (entry) {
                entry.count += plateQty;
                entry.turns[studentTurn] = (entry.turns[studentTurn] || 0) + plateQty;
                entry.courses[studentCourse] = (entry.courses[studentCourse] || 0) + plateQty;
              }
            }
          }
        });
      }
    });

    // 3. Aggregate Menu Change Requests filtered by this month
    monthCambios.forEach(c => {
      if (c.plato_elegido) {
        const chosen = ensureDish(c.plato_elegido, 'ALTERNATIVO');
        if (chosen) {
          chosen.count += 1;
          chosen.changeRequests += 1;
          if (c.curso) {
            chosen.courses[c.curso] = (chosen.courses[c.curso] || 0) + 1;
          }
        }
      }
      if (c.plato_original) {
        const orig = ensureDish(c.plato_original, 'TRADICIONAL');
        if (orig) {
          orig.changeRequests += 1;
        }
      }
    });

    // Convert map to sorted array
    let dishesList = Array.from(dishCounts.values());

    // Calculate total plates served in this month
    const totalMonthPlates = dishesList.reduce((sum, d) => sum + d.count, 0);

    // Calculate maximum count for percentage calculation
    const maxCount = Math.max(...dishesList.map(d => d.count), 1);

    // Compute favorite turn and score for each dish
    dishesList = dishesList.map(dish => {
      let bestTurn = '-';
      let maxTurnCount = 0;
      Object.entries(dish.turns).forEach(([t, cnt]) => {
        if (cnt > maxTurnCount) {
          maxTurnCount = cnt;
          bestTurn = t;
        }
      });

      const popularityRate = totalMonthPlates > 0 && dish.count > 0 
        ? Math.min(100, Math.round((dish.count / maxCount) * 100))
        : 0;

      return {
        ...dish,
        bestTurn: bestTurn === '-' ? (turnsList?.[0]?.value || '11:50') : bestTurn,
        popularityRate
      };
    });

    dishesList.sort((a, b) => b.count - a.count);

    const hasData = totalMonthPlates > 0;
    const top3Dishes = hasData ? dishesList.filter(d => d.count > 0).slice(0, 3) : [];

    return {
      allDishes: dishesList,
      top3: top3Dishes,
      alternativosRanking: dishesList.filter(d => (d.category === 'ALTERNATIVO' || d.changeRequests > 0) && d.count > 0).slice(0, 8),
      fitRanking: dishesList.filter(d => d.category === 'FIT' && d.count > 0).slice(0, 8),
      totalMonthPlates,
      hasData,
      maxCount
    };
  }, [allMonthData, menuTradicionalData, menuFitData, platosAlternativosData, cambiosData, workingDays, selectedMonth, turnsList]);

  // Filtered dishes according to UI filters
  const filteredDishes = useMemo(() => {
    let list = rankingAnalysis.allDishes;

    if (selectedCategory !== 'ALL') {
      list = list.filter(d => d.category === selectedCategory);
    }

    if (selectedTurn !== 'ALL') {
      list = list.filter(d => (d.turns[selectedTurn] || 0) > 0 || d.bestTurn === selectedTurn);
    }

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      list = list.filter(d => d.name.toLowerCase().includes(query));
    }

    return list;
  }, [rankingAnalysis.allDishes, selectedCategory, selectedTurn, searchTerm]);

  return (
    <div className="ranking-platos-container animate-fade-in">
      {/* Top Header */}
      <div className="ranking-header-card premium-card">
        <div className="ranking-header-left">
          <div className="ranking-icon-badge">
            <Trophy size={24} />
          </div>
          <div>
            <h1>Ranking y Popularidad de Platos</h1>
            <p className="ranking-subtitle">
              Descubre qué comidas se consumen más para planificar los próximos menús de <strong>{monthLabel}</strong>
            </p>
          </div>
        </div>

        <div className="ranking-month-picker">
          <Calendar size={18} className="text-primary" />
          <span className="picker-label">Mes:</span>
          <select
            value={selectedMonth}
            onChange={(e) => onChangeMonth && onChangeMonth(e.target.value)}
            className="ranking-month-select"
          >
            {monthsList && monthsList.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 1. Podio Top 3 Platos Estrella */}
      <div className="podium-section">
        <div className="section-header-simple">
          <div className="title-with-sparkle">
            <Sparkles size={20} className="text-amber" />
            <h2>Podio de Comidas Más Populares</h2>
          </div>
          <span className="badge-subtitle">Platos con mayor demanda y preferencia</span>
        </div>

        {!rankingAnalysis.hasData ? (
          <div className="empty-podium-card">
            <Utensils size={36} className="text-muted" />
            <h3>Sin consumos de platos en {monthLabel}</h3>
            <p>Aún no hay registros de asistencia ni consumos cargados para este mes en la planilla de cobros. A medida que marques asistencias día a día, el podio y el ranking se calcularán automáticamente con datos 100% reales.</p>
          </div>
        ) : (
          <div className="podium-grid">
            {/* #2 Plata */}
            {rankingAnalysis.top3[1] && (
              <div className="podium-card podium-card--silver">
                <div className="podium-medal-badge medal-silver">
                  <Medal size={28} />
                  <span className="podium-rank-number">2°</span>
                </div>
                <span className="podium-tag">Segundo Lugar</span>
                <h3 className="podium-dish-name">{rankingAnalysis.top3[1].name}</h3>
                <div className="podium-stats">
                  <div className="stat-pill">
                    <Utensils size={14} />
                    <strong>{rankingAnalysis.top3[1].count}</strong> platos servidos
                  </div>
                  <div className="stat-pill">
                    <Clock size={14} />
                    Turno favorito: <strong>{rankingAnalysis.top3[1].bestTurn}</strong>
                  </div>
                </div>
                <div className="podium-progress">
                  <div 
                    className="podium-progress-fill bg-blue" 
                    style={{ width: `${rankingAnalysis.top3[1].popularityRate}%` }} 
                  />
                </div>
              </div>
            )}

            {/* #1 Oro */}
            {rankingAnalysis.top3[0] && (
              <div className="podium-card podium-card--gold">
                <div className="crown-badge">
                  <Flame size={16} />
                  <span>PLATO ESTRELLA N°1</span>
                </div>
                <div className="podium-medal-badge medal-gold">
                  <Trophy size={36} />
                  <span className="podium-rank-number">1°</span>
                </div>
                <span className="podium-tag tag-gold">¡El Favorito de Todos!</span>
                <h3 className="podium-dish-name text-gold">{rankingAnalysis.top3[0].name}</h3>
                <div className="podium-stats">
                  <div className="stat-pill stat-pill--gold">
                    <Utensils size={15} />
                    <strong>{rankingAnalysis.top3[0].count}</strong> platos servidos
                  </div>
                  <div className="stat-pill stat-pill--gold">
                    <Clock size={15} />
                    Turno favorito: <strong>{rankingAnalysis.top3[0].bestTurn}</strong>
                  </div>
                </div>
                <div className="podium-progress">
                  <div 
                    className="podium-progress-fill bg-gold" 
                    style={{ width: `${rankingAnalysis.top3[0].popularityRate}%` }} 
                  />
                </div>
              </div>
            )}

            {/* #3 Bronce */}
            {rankingAnalysis.top3[2] && (
              <div className="podium-card podium-card--bronze">
                <div className="podium-medal-badge medal-bronze">
                  <Award size={28} />
                  <span className="podium-rank-number">3°</span>
                </div>
                <span className="podium-tag">Tercer Lugar</span>
                <h3 className="podium-dish-name">{rankingAnalysis.top3[2].name}</h3>
                <div className="podium-stats">
                  <div className="stat-pill">
                    <Utensils size={14} />
                    <strong>{rankingAnalysis.top3[2].count}</strong> platos servidos
                  </div>
                  <div className="stat-pill">
                    <Clock size={14} />
                    Turno favorito: <strong>{rankingAnalysis.top3[2].bestTurn}</strong>
                  </div>
                </div>
                <div className="podium-progress">
                  <div 
                    className="podium-progress-fill bg-amber" 
                    style={{ width: `${rankingAnalysis.top3[2].popularityRate}%` }} 
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Filtros y Tabla General de Ranking */}
      <div className="ranking-table-card premium-card">
        <div className="ranking-table-header">
          <div className="table-header-title">
            <Utensils size={18} className="text-primary" />
            <h2>Tabla Completa de Popularidad</h2>
          </div>

          <div className="ranking-filters-bar">
            <div className="ranking-search-box">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar plato o ingrediente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ranking-search-input"
              />
            </div>

            {/* Category Filter */}
            <div className="filter-pill-group">
              <button 
                className={`filter-pill-btn ${selectedCategory === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('ALL')}
              >
                Todos
              </button>
              <button 
                className={`filter-pill-btn ${selectedCategory === 'TRADICIONAL' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('TRADICIONAL')}
              >
                Tradicional
              </button>
              <button 
                className={`filter-pill-btn ${selectedCategory === 'FIT' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('FIT')}
              >
                Menú FIT
              </button>
              <button 
                className={`filter-pill-btn ${selectedCategory === 'ALTERNATIVO' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('ALTERNATIVO')}
              >
                Alternativos
              </button>
            </div>

            {/* Turn Filter */}
            <div className="turn-select-box">
              <Clock size={15} className="text-muted" />
              <select
                value={selectedTurn}
                onChange={(e) => setSelectedTurn(e.target.value)}
                className="ranking-select-turn"
              >
                <option value="ALL">Todos los turnos</option>
                {turnsList && turnsList.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="ranking-table">
            <thead>
              <tr>
                <th className="text-center" style={{ width: '60px' }}>Puesto</th>
                <th>Nombre del Plato / Comida</th>
                <th className="text-center">Tipo</th>
                <th className="text-center">Turno Preferido</th>
                <th className="text-right">Platos Servidos</th>
                <th style={{ width: '220px' }}>Nivel de Popularidad</th>
              </tr>
            </thead>
            <tbody>
              {filteredDishes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-muted">
                    No se encontraron platos que coincidan con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredDishes.map((dish, idx) => {
                  const isTop3 = idx < 3 && selectedCategory === 'ALL' && selectedTurn === 'ALL';
                  return (
                    <tr key={dish.name} className={isTop3 ? 'row-top3' : ''}>
                      <td className="text-center font-bold">
                        {idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `#${idx + 1}`}
                      </td>
                      <td className="font-semibold text-primary">
                        {dish.name}
                        {dish.changeRequests > 0 && (
                          <span className="badge-change-requests" title={`${dish.changeRequests} solicitudes de cambio recibidas`}>
                            {dish.changeRequests} cambios
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        <span className={`badge-dish-category badge-cat--${dish.category.toLowerCase()}`}>
                          {dish.category}
                        </span>
                      </td>
                      <td className="text-center font-medium">
                        <span className="badge-turn-preferred">
                          {dish.bestTurn}
                        </span>
                      </td>
                      <td className="text-right font-bold text-emerald">
                        {dish.count} <span className="unit-platos">platos</span>
                      </td>
                      <td>
                        <div className="ranking-bar-wrapper">
                          <div className="ranking-bar-track">
                            <div 
                              className={`ranking-bar-fill ${dish.popularityRate >= 75 ? 'bg-emerald' : dish.popularityRate >= 40 ? 'bg-blue' : 'bg-amber'}`}
                              style={{ width: `${dish.popularityRate}%` }}
                            />
                          </div>
                          <span className="ranking-bar-percentage">{dish.popularityRate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Panel de Consejos para Armar el Menú */}
      <div className="menu-planning-tips-card premium-card">
        <div className="tips-header">
          <Sparkles size={20} className="text-amber" />
          <h2>Guía Inteligente para Armar el Menú de Fernanda</h2>
        </div>

        <div className="tips-grid">
          <div className="tip-card tip-card--stars">
            <div className="tip-card-header">
              <ThumbsUp size={18} className="text-emerald" />
              <h3>Platos de Éxito Seguro (Fijos)</h3>
            </div>
            <p className="tip-card-desc">
              Estos platos tienen la mayor tasa de consumo y asistencia. Son ideales para días clave (como viernes o inicio de semana):
            </p>
            <ul className="tip-dish-list">
              {rankingAnalysis.top3.map(d => (
                <li key={d.name}>
                  <CheckCircle2 size={15} className="text-emerald" />
                  <span><strong>{d.name}</strong> ({d.count} platos)</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="tip-card tip-card--alternatives">
            <div className="tip-card-header">
              <RefreshCw size={18} className="text-blue" />
              <h3>Alternativos Más Pedidos</h3>
            </div>
            <p className="tip-card-desc">
              Comidas que los padres solicitan con frecuencia mediante el bot de WhatsApp:
            </p>
            <ul className="tip-dish-list">
              {rankingAnalysis.alternativosRanking.slice(0, 3).map(d => (
                <li key={d.name}>
                  <Utensils size={15} className="text-blue" />
                  <span><strong>{d.name}</strong></span>
                </li>
              ))}
            </ul>
          </div>

          <div className="tip-card tip-card--fit">
            <div className="tip-card-header">
              <Award size={18} className="text-purple" />
              <h3>Favoritos del Menú FIT</h3>
            </div>
            <p className="tip-card-desc">
              Los platos saludables que mejor aceptación tienen en los turnos de la tarde (12:40 y 13:05):
            </p>
            <ul className="tip-dish-list">
              {rankingAnalysis.fitRanking.slice(0, 3).map(d => (
                <li key={d.name}>
                  <CheckCircle2 size={15} className="text-purple" />
                  <span><strong>{d.name}</strong></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
