import 'package:material_ui/material_ui.dart';

/// Lazy independent columns with the same round-robin assignment as Row/Column.
/// Each column scrolls in the shared viewport and retains natural card heights.
class LazyCardColumns extends StatelessWidget {
  const LazyCardColumns({
    super.key,
    required this.columnCount,
    required this.itemCount,
    required this.gap,
    required this.itemBuilder,
    this.trailingGap = true,
  });
  final int columnCount;
  final int itemCount;
  final double gap;
  final IndexedWidgetBuilder itemBuilder;
  final bool trailingGap;

  @override
  Widget build(BuildContext context) => SliverCrossAxisGroup(
    slivers: [
      for (var column = 0; column < columnCount; column++)
        SliverCrossAxisExpanded(
          flex: 1,
          sliver: SliverPadding(
            padding: EdgeInsets.only(
              right: column == columnCount - 1 ? 0 : gap,
            ),
            sliver: SliverList.builder(
              itemCount: ((itemCount - column) / columnCount).ceil().clamp(
                0,
                itemCount,
              ),
              itemBuilder: (context, row) {
                final index = column + row * columnCount;
                return Padding(
                  padding: EdgeInsets.only(
                    bottom: trailingGap || index + columnCount < itemCount
                        ? gap
                        : 0,
                  ),
                  child: SizedBox(
                    width: double.infinity,
                    child: itemBuilder(context, index),
                  ),
                );
              },
            ),
          ),
        ),
    ],
  );
}
