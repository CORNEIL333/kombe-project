import 'package:flutter/material.dart';

import 'kombe_colors.dart';
import 'kombe_spacing.dart';
import 'kombe_tokens.g.dart';

/// Typographie « Ndop » :
/// - Fraunces (serif) pour ce qui se lit comme un titre de page ou une somme :
///   grands titres d'écran et montants, en chiffres tabulaires ;
/// - Manrope pour toute l'interface (libellés, listes, boutons, texte).
/// `titre`/`accent` gardent le style de l'écran « Connectez-vous » (Manrope
/// ExtraBold + olive) : ne pas les convertir.
abstract final class KombeType {
  static const String serif = 'Fraunces';

  static TextStyle titre({double size = 32, Color color = KombeColors.forest, double height = 1.08, FontWeight weight = FontWeight.w800}) => TextStyle(
        fontFamily: KombeTokens.fontUi,
        fontWeight: weight,
        fontSize: size,
        height: height,
        letterSpacing: -size * .032,
        color: color,
      );
  static TextStyle accent({double size = 28, Color color = KombeColors.olive, double height = 1.08}) => titre(size: size, color: color, height: height);

  /// Titre éditorial (en-têtes d'écran, demi-fenêtres importantes).
  static TextStyle display({double size = 30, Color color = KombeColors.forest, double height = 1.1}) => TextStyle(
        fontFamily: serif,
        fontWeight: FontWeight.w700,
        fontSize: size,
        height: height,
        letterSpacing: -size * .025,
        color: color,
      );

  /// Montant : Fraunces, chiffres tabulaires (les colonnes s'alignent).
  static TextStyle amount({double size = 28, Color color = KombeColors.forest, FontWeight weight = FontWeight.w700}) => TextStyle(
        fontFamily: serif,
        fontWeight: weight,
        fontSize: size,
        height: 1.05,
        letterSpacing: -size * .01,
        color: color,
        fontFeatures: const <FontFeature>[FontFeature.tabularFigures(), FontFeature.liningFigures()],
      );

  /// Sur-titre de section : petites capitales espacées.
  static const TextStyle eyebrow = TextStyle(
    fontFamily: KombeTokens.fontUi,
    fontWeight: FontWeight.w800,
    fontSize: 11.5,
    height: 1.2,
    letterSpacing: 1.1,
    color: KombeColors.slate,
  );
}

abstract final class KombeTheme {
  /// Forme des actions : la pilule, partout.
  static const OutlinedBorder cut = StadiumBorder();

  static ThemeData light() {
    final ColorScheme scheme = ColorScheme.fromSeed(
      seedColor: KombeColors.forest,
      brightness: Brightness.light,
    ).copyWith(
      primary: KombeColors.forest,
      onPrimary: KombeColors.cream,
      primaryContainer: KombeColors.mint,
      onPrimaryContainer: KombeColors.forest,
      secondary: KombeColors.gold,
      onSecondary: KombeColors.ink,
      secondaryContainer: KombeColors.mint,
      onSecondaryContainer: KombeColors.forest,
      tertiary: KombeColors.jade,
      onTertiary: Colors.white,
      surface: KombeColors.cream,
      onSurface: KombeColors.ink,
      onSurfaceVariant: KombeColors.slate,
      surfaceContainerLowest: Colors.white,
      surfaceContainerLow: const Color(0xFFFAFAFE),
      surfaceContainer: const Color(0xFFF0F0F9),
      surfaceContainerHigh: KombeColors.sand,
      surfaceContainerHighest: const Color(0xFFE2E3F3),
      outline: KombeColors.lineStrong,
      outlineVariant: KombeColors.line,
      error: KombeColors.danger,
      surfaceTint: Colors.transparent,
    );

    final ThemeData base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: KombeColors.cream,
      visualDensity: VisualDensity.standard,
      splashFactory: InkSparkle.splashFactory,
      fontFamily: KombeTokens.fontUi,
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: <TargetPlatform, PageTransitionsBuilder>{
          TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
        },
      ),
    );
    final TextTheme t = base.textTheme;
    TextStyle serif(TextStyle? s, double size) => (s ?? const TextStyle()).copyWith(
          fontFamily: KombeType.serif,
          fontSize: size,
          fontWeight: FontWeight.w700,
          color: KombeColors.forest,
          height: 1.1,
          letterSpacing: -size * .025,
        );
    const TextStyle ui = TextStyle(fontFamily: KombeTokens.fontUi);
    final BorderRadius field = BorderRadius.circular(KombeSpacing.fieldRadius);

    return base.copyWith(
      textTheme: t.copyWith(
        displayLarge: serif(t.displayLarge, 52),
        displayMedium: serif(t.displayMedium, 44),
        displaySmall: serif(t.displaySmall, 36),
        headlineLarge: serif(t.headlineLarge, 32),
        headlineMedium: serif(t.headlineMedium, 28),
        headlineSmall: serif(t.headlineSmall, 24),
        titleLarge: serif(t.titleLarge, 22),
        titleMedium: t.titleMedium?.copyWith(fontSize: 16, color: KombeColors.ink, fontWeight: FontWeight.w700, letterSpacing: -.1),
        titleSmall: t.titleSmall?.copyWith(fontSize: 14, color: KombeColors.ink, fontWeight: FontWeight.w700),
        bodyLarge: t.bodyLarge?.copyWith(color: KombeColors.ink, height: 1.45),
        bodyMedium: t.bodyMedium?.copyWith(color: KombeColors.slate, height: 1.45),
        bodySmall: t.bodySmall?.copyWith(color: KombeColors.slate, height: 1.4, fontSize: 12.5),
        labelLarge: t.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        labelMedium: t.labelMedium?.copyWith(fontWeight: FontWeight.w700, color: KombeColors.slate),
        labelSmall: t.labelSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: .4, color: KombeColors.slate),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: KombeColors.cream,
        foregroundColor: KombeColors.forest,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: .5,
        shadowColor: KombeColors.line,
        centerTitle: false,
        titleSpacing: 4,
        titleTextStyle: KombeType.display(size: 21),
        iconTheme: const IconThemeData(color: KombeColors.forest),
        actionsIconTheme: const IconThemeData(color: KombeColors.forest),
      ),
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(horizontal: KombeSpacing.screen),
        minVerticalPadding: 10,
        horizontalTitleGap: 14,
        iconColor: KombeColors.forest,
        textColor: KombeColors.ink,
        titleTextStyle: ui.copyWith(fontSize: 15.5, fontWeight: FontWeight.w600, color: KombeColors.ink, height: 1.3),
        subtitleTextStyle: ui.copyWith(fontSize: 13.5, color: KombeColors.slate, height: 1.35),
        leadingAndTrailingTextStyle: ui.copyWith(fontSize: 14, fontWeight: FontWeight.w700, color: KombeColors.forest),
        selectedColor: KombeColors.forest,
        selectedTileColor: KombeColors.mint.withValues(alpha: .5),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(KombeSpacing.cardRadius),
          ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
        labelStyle: ui.copyWith(color: KombeColors.slate, fontWeight: FontWeight.w500),
        floatingLabelStyle: ui.copyWith(color: KombeColors.emerald, fontWeight: FontWeight.w700),
        hintStyle: ui.copyWith(color: KombeColors.slate.withValues(alpha: .7)),
        helperStyle: ui.copyWith(color: KombeColors.slate, fontSize: 12.5),
        prefixIconColor: KombeColors.slate,
        suffixIconColor: KombeColors.slate,
        border: OutlineInputBorder(borderRadius: field, borderSide: const BorderSide(color: KombeColors.line)),
        enabledBorder: OutlineInputBorder(borderRadius: field, borderSide: const BorderSide(color: KombeColors.lineStrong)),
        focusedBorder: OutlineInputBorder(borderRadius: field, borderSide: const BorderSide(color: KombeColors.emerald, width: 1.8)),
        errorBorder: OutlineInputBorder(borderRadius: field, borderSide: const BorderSide(color: KombeColors.danger)),
        focusedErrorBorder: OutlineInputBorder(borderRadius: field, borderSide: const BorderSide(color: KombeColors.danger, width: 1.8)),
        disabledBorder: OutlineInputBorder(borderRadius: field, borderSide: const BorderSide(color: KombeColors.line)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          padding: const EdgeInsets.symmetric(horizontal: 22),
          backgroundColor: KombeColors.forest,
          foregroundColor: KombeColors.cream,
          disabledBackgroundColor: KombeColors.forest.withValues(alpha: .14),
          disabledForegroundColor: KombeColors.forest.withValues(alpha: .45),
          shape: KombeTheme.cut,
          textStyle: ui.copyWith(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: -.1),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          foregroundColor: KombeColors.forest,
          backgroundColor: Colors.white,
          side: const BorderSide(color: KombeColors.lineStrong, width: 1.2),
          shape: KombeTheme.cut,
          textStyle: ui.copyWith(fontSize: 15.5, fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: KombeColors.emerald,
          minimumSize: const Size(48, 44),
          shape: KombeTheme.cut,
          textStyle: ui.copyWith(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(foregroundColor: KombeColors.forest, minimumSize: const Size.square(48)),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: KombeColors.forest,
        foregroundColor: KombeColors.cream,
        elevation: 2,
        highlightElevation: 4,
        shape: KombeTheme.cut,
        extendedTextStyle: ui.copyWith(fontSize: 15.5, fontWeight: FontWeight.w800),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: Colors.white,
        selectedColor: KombeColors.forest,
        secondarySelectedColor: KombeColors.forest,
        disabledColor: KombeColors.sand,
        checkmarkColor: KombeColors.cream,
        side: const BorderSide(color: KombeColors.lineStrong),
        shape: KombeTheme.cut,
        labelStyle: ui.copyWith(fontSize: 13.5, fontWeight: FontWeight.w600, color: KombeColors.ink),
        secondaryLabelStyle: ui.copyWith(fontSize: 13.5, fontWeight: FontWeight.w700, color: KombeColors.cream),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        showCheckmark: false,
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          shape: const WidgetStatePropertyAll<OutlinedBorder>(KombeTheme.cut),
          side: const WidgetStatePropertyAll<BorderSide>(BorderSide(color: KombeColors.lineStrong)),
          backgroundColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? KombeColors.forest : Colors.white),
          foregroundColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? KombeColors.cream : KombeColors.ink),
          iconColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? KombeColors.cream : KombeColors.forest),
          textStyle: WidgetStatePropertyAll<TextStyle>(ui.copyWith(fontSize: 14, fontWeight: FontWeight.w700)),
          minimumSize: const WidgetStatePropertyAll<Size>(Size(48, 46)),
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? Colors.white : KombeColors.slate),
        trackColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? KombeColors.emerald : KombeColors.sand),
        trackOutlineColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? KombeColors.emerald : KombeColors.lineStrong),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? KombeColors.emerald : Colors.white),
        checkColor: const WidgetStatePropertyAll<Color>(Colors.white),
        side: const BorderSide(color: KombeColors.lineStrong, width: 1.6),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith((Set<WidgetState> s) => s.contains(WidgetState.selected) ? KombeColors.emerald : KombeColors.slate),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: KombeColors.emerald,
        linearTrackColor: KombeColors.mint,
        circularTrackColor: Colors.transparent,
        linearMinHeight: 6,
        borderRadius: BorderRadius.circular(99),
      ),
      sliderTheme: const SliderThemeData(
        activeTrackColor: KombeColors.emerald,
        inactiveTrackColor: KombeColors.mint,
        thumbColor: KombeColors.forest,
        overlayColor: Color(0x222F35A8),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: KombeColors.forest,
        unselectedLabelColor: KombeColors.slate,
        labelStyle: ui.copyWith(fontSize: 14.5, fontWeight: FontWeight.w800),
        unselectedLabelStyle: ui.copyWith(fontSize: 14.5, fontWeight: FontWeight.w600),
        indicatorSize: TabBarIndicatorSize.label,
        indicator: const UnderlineTabIndicator(
          borderSide: BorderSide(color: KombeColors.goldWarm, width: 3),
          borderRadius: BorderRadius.vertical(top: Radius.circular(3)),
        ),
        dividerColor: KombeColors.line,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: KombeColors.cream,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: KombeColors.lineStrong,
        dragHandleSize: Size(40, 4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(KombeSpacing.sheetRadius))),
        clipBehavior: Clip.antiAlias,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: KombeColors.cream,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(KombeSpacing.sheetRadius)),
        titleTextStyle: KombeType.display(size: 22),
        contentTextStyle: ui.copyWith(fontSize: 15, color: KombeColors.ink, height: 1.45),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: KombeColors.forest,
        contentTextStyle: ui.copyWith(color: KombeColors.cream, fontSize: 14.5, fontWeight: FontWeight.w600),
        actionTextColor: KombeColors.goldLight,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(color: KombeColors.ink, borderRadius: BorderRadius.circular(8)),
        textStyle: ui.copyWith(color: KombeColors.cream, fontSize: 12.5, fontWeight: FontWeight.w600),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: Colors.white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: KombeColors.line)),
        textStyle: ui.copyWith(fontSize: 15, color: KombeColors.ink, fontWeight: FontWeight.w600),
      ),
      menuTheme: const MenuThemeData(
        style: MenuStyle(
          backgroundColor: WidgetStatePropertyAll<Color>(Colors.white),
          surfaceTintColor: WidgetStatePropertyAll<Color>(Colors.transparent),
        ),
      ),
      expansionTileTheme: const ExpansionTileThemeData(
        shape: Border(),
        collapsedShape: Border(),
        iconColor: KombeColors.forest,
        collapsedIconColor: KombeColors.slate,
        tilePadding: EdgeInsets.symmetric(horizontal: KombeSpacing.screen),
      ),
      badgeTheme: const BadgeThemeData(backgroundColor: KombeColors.goldWarm, textColor: KombeColors.ink),
      navigationBarTheme: NavigationBarThemeData(
        height: 72,
        elevation: 0,
        backgroundColor: KombeColors.forest,
        surfaceTintColor: Colors.transparent,
        indicatorColor: KombeColors.goldWarm,
        indicatorShape: KombeTheme.cut,
        iconTheme: WidgetStateProperty.resolveWith(
          (Set<WidgetState> s) => IconThemeData(color: s.contains(WidgetState.selected) ? KombeColors.ink : Colors.white, size: 24),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (Set<WidgetState> states) => ui.copyWith(
            color: states.contains(WidgetState.selected) ? Colors.white : const Color(0xCCFFFFFF),
            fontSize: 12,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
          ),
        ),
      ),
      drawerTheme: const DrawerThemeData(backgroundColor: KombeColors.cream, surfaceTintColor: Colors.transparent),
      dividerTheme: const DividerThemeData(color: KombeColors.line, thickness: 1, space: 1),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: KombeColors.cream,
        surfaceTintColor: Colors.transparent,
        headerBackgroundColor: KombeColors.forest,
        headerForegroundColor: KombeColors.cream,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(KombeSpacing.sheetRadius)),
      ),
    );
  }
}
