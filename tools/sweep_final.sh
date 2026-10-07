#!/bin/bash
# 最终护栏复跑：一个个跑（每个都要起 headless Chrome，连着跑会抢端口），结果汇总到一个文件。
cd "$(dirname "$0")/.." || exit 1
OUT="shots/sweep-final.txt"
: > "$OUT"
for t in verify_globe_colors verify_globe_coverage verify_globe_land verify_globe_spin \
         verify_appearance verify_icons verify_touch_targets verify_footer_credit \
         verify_search verify_detail_charts verify_title verify_farm_entry \
         verify_latency_range verify_peek_latency verify_detail_preload \
         verify_public_remark verify_card_style_menu verify_card_styles \
         verify_compact_notes verify_globe_layout verify_summary verify_globe; do
  line=$(node "tools/$t.mjs" 2>&1 | grep -E "[0-9]+ PASS / [0-9]+ FAIL|[0-9]+ 条通过|PASS [0-9]+ / FAIL [0-9]+|全部通过" | tail -1)
  printf "%-26s %s\n" "$t" "${line:-（没抓到结果行，得单独看）}" | tee -a "$OUT"
  sleep 2
done
echo "===== 跑完 =====" >> "$OUT"
