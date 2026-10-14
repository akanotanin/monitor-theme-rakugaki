#!/bin/bash
# 最终护栏复跑：一个个跑（每个都要起 headless Chrome，连着跑会抢端口），结果汇总到一个文件。
cd "$(dirname "$0")/.." || exit 1
OUT="shots/sweep-final.txt"
: > "$OUT"
# verify_icons / verify_farm_entry 默认都要 5199（与 serve.mjs 同号）：本机只要别的会话留着一个 serve
# 占着它，这两支就 EADDRINUSE 直接退出、连摘要行都不打 —— sweep 里只显示「没抓到结果行」这种静默假红。
# 统一给它们错开端口（两支各自认 FARM_PORT / ICON_PORT，其余工具忽略这两个变量）。
export FARM_PORT=5899 ICON_PORT=5898
for t in verify_globe_colors verify_globe_coverage verify_globe_land verify_globe_spin \
         verify_appearance verify_icons verify_touch_targets verify_footer_credit \
         verify_search verify_detail_charts verify_title verify_farm_entry \
         verify_latency_range verify_peek_retired verify_detail_preload \
         verify_public_remark verify_card_style_menu verify_card_styles \
         verify_card_netrow_fit verify_card_expiry_fit verify_offline_last \
         verify_compact_notes verify_globe_layout verify_summary verify_globe \
         verify_globe_scale verify_offline_time verify_visibility \
         verify_region_names verify_hub141; do
  line=$(node "tools/$t.mjs" 2>&1 | grep -E "[0-9]+ PASS / [0-9]+ FAIL|ALL PASS|[0-9]+ 条通过|[0-9]+ 个视角通过|PASS [0-9]+ / FAIL [0-9]+|全部通过|FAIL [0-9]+ 条" | tail -1)
  printf "%-26s %s\n" "$t" "${line:-（没抓到结果行，得单独看）}" | tee -a "$OUT"
  sleep 2
done
# 注：verify_latency_range / verify_detail_preload 需要活的站点（本机隧道 / 上游 hub）与各自参数，
#     裸跑必然「没抓到结果行」——跑真机时单独指定（用法见各工具头部；或经 shot_local.mjs --run）。
echo "===== 跑完 =====" >> "$OUT"
