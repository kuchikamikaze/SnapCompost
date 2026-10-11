// Smoke test minimal untuk Tahap A.
// Verifikasi: aplikasi dapat dibangun tanpa exception, NavigationBar
// dengan 3 destination muncul, dan tab "Tambah" dapat diklik untuk
// berganti placeholder.

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

import 'package:snapcompost_app/main.dart';

void main() {
  testWidgets('App builds with bottom nav of 3 destinations',
      (WidgetTester tester) async {
    await tester.pumpWidget(const SnapCompostApp());
    await tester.pumpAndSettle();

    expect(find.byType(MainShell), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.byType(NavigationDestination), findsNWidgets(3));
  });

  testWidgets('Tapping Tambah tab switches to Tambah Sampah placeholder',
      (WidgetTester tester) async {
    await tester.pumpWidget(const SnapCompostApp());
    await tester.pumpAndSettle();

    // Tambah Sampah placeholder hanya muncul setelah tab Tambah dipilih.
    expect(find.text('Tambah Sampah'), findsNothing);

    await tester.tap(find.text('Tambah'));
    await tester.pumpAndSettle();

    expect(find.text('Tambah Sampah'), findsOneWidget);
  });
}
