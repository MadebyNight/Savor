import { isMissingLocalImage } from "../storage.js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./Dialog.jsx";

export default function RecipeSnapshotDialog({ recipe, onClose }) {
  return (
    <Dialog open={!!recipe} onOpenChange={(open) => !open && onClose()}>
      <DialogContent layout="page" className="app-dialog meal-snapshot-dialog">
        <DialogTitle>{recipe?.name || "菜谱内容已缺失"}</DialogTitle>
        <DialogDescription>已安排时保存的菜谱快照，仅供查看。</DialogDescription>
        {recipe?.image && (isMissingLocalImage(recipe.image)
          ? <p className="subtle">图片暂时无法读取，原引用已保留。</p>
          : <img className="detail-image" src={recipe.image} alt={recipe.name} />)}
        <h3>所需食材</h3>
        {recipe?.ingredients?.length ? recipe.ingredients.map((ingredient, index) => (
          <div className="detail-ingredient" key={index}>
            <span>{ingredient.name}</span>
            <span>{ingredient.qty ?? "待确认"}{ingredient.unit}</span>
          </div>
        )) : <p>快照中没有食材信息。</p>}
        <h3>制作步骤</h3>
        {recipe?.steps?.length ? recipe.steps.map((step, index) => (
          <p key={index}><b className="step-number">{index + 1}</b>{step}</p>
        )) : <p>快照中没有制作步骤。</p>}
      </DialogContent>
    </Dialog>
  );
}
