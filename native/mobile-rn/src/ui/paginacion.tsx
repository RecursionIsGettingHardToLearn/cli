// ---------------------------------------------------------------------------
// Paginacion para listas en React Native (client-side, scroll infinito).
//
// Patron: la pantalla ya tiene el array completo (GraphQL); este hook entrega
// solo una "pagina" creciente para que FlatList monte pocos items, y al llegar
// al final (onEndReached) suma la siguiente pagina. PiePaginacion muestra el
// progreso y un boton manual "Cargar mas" por si onEndReached no dispara.
//
// Uso:
//   const pag = usePaginacion(filtrados, 15);
//   <FlatList
//     data={pag.items}
//     onEndReached={pag.cargarMas}
//     onEndReachedThreshold={0.4}
//     ListFooterComponent={<PiePaginacion {...pag.pie} />}
//   />
// ---------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from './kit';

export interface PiePaginacionProps {
  visibles: number;
  total: number;
  onCargarMas: () => void;
}

export function usePaginacion<T>(data: T[], porPagina = 15) {
  const [visibles, setVisibles] = useState(porPagina);

  // Si cambia el dataset (busqueda, refetch que altera el tamano), volvemos
  // a la primera pagina para no mostrar un corte inconsistente.
  const len = data.length;
  const prevLen = useRef(len);
  useEffect(() => {
    if (prevLen.current !== len) {
      prevLen.current = len;
      setVisibles(porPagina);
    }
  }, [len, porPagina]);

  const items = useMemo(() => data.slice(0, visibles), [data, visibles]);

  function cargarMas() {
    setVisibles(v => (v >= len ? v : Math.min(v + porPagina, len)));
  }

  return {
    items,
    cargarMas,
    hayMas: visibles < len,
    pie: { visibles: Math.min(visibles, len), total: len, onCargarMas: cargarMas } as PiePaginacionProps,
  };
}

export function PiePaginacion({ visibles, total, onCargarMas }: PiePaginacionProps) {
  if (total === 0) return null;
  const hayMas = visibles < total;
  return (
    <View style={pst.wrap}>
      <Text style={pst.info}>
        Mostrando {visibles} de {total}
      </Text>
      {hayMas && (
        <TouchableOpacity style={pst.btn} onPress={onCargarMas} activeOpacity={0.8}>
          <Text style={pst.btnText}>Cargar más</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const pst = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 14, gap: 8 },
  info: { color: COLORS.textMuted, fontSize: 12 },
  btn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  btnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
});
