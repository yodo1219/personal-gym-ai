import { supabase } from "@/lib/supabase";

export type ReceiptUser = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  plan: string;
  created_at: string;
};

/**
 * 経理LINEのuserIdから receipt_users を取得する。
 * 初めて話しかけてきたユーザーなら自動で新規作成する（食事指導のように
 * トレーナーが事前に顧客登録する運用ではなく、本人がLINE追加したら
 * そのまま使い始められる想定）。
 */
export async function getOrCreateReceiptUser(
  lineUserId: string,
  displayName?: string
): Promise<ReceiptUser | null> {
  const { data: existing, error: fetchError } = await supabase
    .from("receipt_users")
    .select("*")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (fetchError) {
    console.error("receipt_users 取得エラー:", fetchError);
    return null;
  }

  if (existing) return existing as ReceiptUser;

  const { data: created, error: insertError } = await supabase
    .from("receipt_users")
    .insert({
      line_user_id: lineUserId,
      display_name: displayName ?? null,
    })
    .select()
    .single();

  if (insertError) {
    console.error("receipt_users 作成エラー:", insertError);
    return null;
  }

  return created as ReceiptUser;
}