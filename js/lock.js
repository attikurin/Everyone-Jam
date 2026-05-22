/* =========================================
   みんなのジャム - ボードロック機能
   先生モードで作成したオブジェクトを、生徒モードでは編集不可にする
   ========================================= */

(function () {
  const TEACHER_KEY = 'minnanojam_teacher_mode';

  // 公開状態
  window.LockMode = {
    isTeacher: false,
  };

  function loadMode() {
    try {
      LockMode.isTeacher = localStorage.getItem(TEACHER_KEY) === '1';
    } catch (e) {
      LockMode.isTeacher = false;
    }
    updateModeUI();
  }

  function setTeacherMode(on) {
    LockMode.isTeacher = !!on;
    try { localStorage.setItem(TEACHER_KEY, on ? '1' : '0'); } catch (e) {}
    updateModeUI();
    // 既存オブジェクトの編集可否を再評価
    refreshAllNodesDraggable();
    if (typeof showToast === 'function') {
      showToast(on
        ? '👩‍🏫 先生モードに切り替えました（描いたものは生徒が編集できません）'
        : '👦 生徒モードに切り替えました');
    }
  }

  function updateModeUI() {
    const btn = document.getElementById('btn-teacher-mode');
    if (!btn) return;
    if (LockMode.isTeacher) {
      btn.classList.add('teacher-on');
      btn.innerHTML = '<i class="fa-solid fa-chalkboard-user mr-1"></i>先生';
      btn.setAttribute('title', '先生モード ON：描いたものはロックされます（クリックで生徒モードへ）');
    } else {
      btn.classList.remove('teacher-on');
      btn.innerHTML = '<i class="fa-solid fa-user-graduate mr-1"></i>生徒';
      btn.setAttribute('title', '生徒モード：先生がロックしたものは編集できません（クリックで先生モードへ）');
    }
    // ボディに目印クラス
    document.body.classList.toggle('teacher-mode', LockMode.isTeacher);
  }

  // オブジェクトに対する「自分が編集できるか」の判定
  // 先生モード：すべて編集可
  // 生徒モード：lockedByTeacher のものは不可
  window.canEditObject = function (objData) {
    if (!objData) return true;
    if (LockMode.isTeacher) return true;
    return !objData.lockedByTeacher;
  };

  // 新規作成オブジェクトに「先生作成フラグ」を付与する
  // 既存のaddObjectToPage() を呼ぶ前にこの関数で印を付ける
  window.markObjectByCurrentRole = function (objData) {
    if (!objData) return objData;
    if (LockMode.isTeacher) {
      objData.lockedByTeacher = true;
    }
    return objData;
  };

  // ノードのdraggable属性を権限に応じて再設定
  function refreshAllNodesDraggable() {
    if (typeof State === 'undefined' || !State.mainLayer) return;
    const page = State.pages && State.pages[State.currentPageIndex];
    if (!page) return;
    const map = {};
    page.objects.forEach(o => { map[o.id] = o; });
    State.mainLayer.getChildren().forEach(node => {
      const id = node.id();
      if (!id || id === 'bg-group') return;
      const data = map[id];
      const editable = canEditObject(data);
      node.draggable(editable);
      // 視覚的な印（生徒モードでロックされたもの）
      if (data && data.lockedByTeacher && !LockMode.isTeacher) {
        node.opacity(node.opacity() < 1 ? node.opacity() : 1); // 不透明度はそのまま
        // ロック中フラグを付ける（CSSやコンテキストメニューで使う）
        node.setAttr('_locked', true);
      } else {
        node.setAttr('_locked', false);
      }
    });
    State.mainLayer.batchDraw();

    // 選択中ノードがロック対象なら選択解除
    if (typeof clearSelection === 'function' && State.selected) {
      const sel = State.selected;
      const id = sel.id();
      const data = map[id];
      if (data && !canEditObject(data)) {
        clearSelection();
      }
    }
  }

  // 既存オブジェクトに対する個別ロック切替（先生のみ）
  window.toggleObjectLock = function (objId) {
    if (!LockMode.isTeacher) {
      if (typeof showToast === 'function') showToast('🔒 先生モードでのみロック操作できます');
      return;
    }
    const page = State.pages && State.pages[State.currentPageIndex];
    if (!page) return;
    const obj = page.objects.find(o => o.id === objId);
    if (!obj) return;
    obj.lockedByTeacher = !obj.lockedByTeacher;
    if (typeof pushHistory === 'function') pushHistory();
    if (typeof saveBoardToStorage === 'function') saveBoardToStorage();
    if (typeof broadcastChange === 'function') broadcastChange();
    refreshAllNodesDraggable();
    if (typeof showToast === 'function') {
      showToast(obj.lockedByTeacher ? '🔒 ロックしました' : '🔓 ロックを解除しました');
    }
  };

  // 起動時のセットアップ
  function setup() {
    loadMode();
    const btn = document.getElementById('btn-teacher-mode');
    if (btn) {
      btn.addEventListener('click', () => {
        // 切替時に確認（誤操作防止）
        if (!LockMode.isTeacher) {
          if (!confirm('先生モードに切り替えます。\n以降あなたが描いたものは、生徒には編集できなくなります。よろしいですか？')) return;
        }
        setTeacherMode(!LockMode.isTeacher);
      });
    }
    // ページ切替・ボード読込後にも再評価
    document.addEventListener('mnj:page-rendered', refreshAllNodesDraggable);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  // 公開
  window.LockMode.refresh = refreshAllNodesDraggable;
  window.LockMode.setTeacher = setTeacherMode;
})();
