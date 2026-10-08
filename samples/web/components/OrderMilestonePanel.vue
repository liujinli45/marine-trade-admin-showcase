<template>
  <el-card class="milestone-panel" shadow="never">
    <template #header><div class="panel-header"><div><strong>{{ text.title }}</strong><span v-if="overdueCount">{{ overdueCount }} {{ text.overdue }}</span></div><el-button type="primary" size="small" @click="openDialog">{{ text.add }}</el-button></div></template>
    <el-timeline v-if="milestones.length">
      <el-timeline-item v-for="item in milestones" :key="item.id" :timestamp="item.planned_date" :type="item.effective_status === 'completed' ? 'success' : item.effective_status === 'delayed' ? 'danger' : 'primary'" placement="top">
        <div class="milestone" :class="item.effective_status"><div><el-tag size="small" :type="item.effective_status === 'completed' ? 'success' : item.effective_status === 'delayed' ? 'danger' : 'info'">{{ text.types[item.milestone_type] || text.types.custom }}</el-tag><strong>{{ item.title }}</strong><p v-if="item.notes">{{ item.notes }}</p><small v-if="item.original_planned_date" class="reschedule-note">{{text.original}} {{String(item.original_planned_date).slice(0,10)}} · {{item.reschedule_reason}}</small></div><div><el-button link type="primary" @click="edit(item)">{{text.edit}}</el-button><el-button link :type="item.completed_at ? 'info' : 'success'" @click="toggle(item)">{{ item.completed_at ? text.reopen : text.complete }}</el-button><el-button v-if="canDelete" link type="danger" @click="remove(item)">{{ text.delete }}</el-button></div></div>
      </el-timeline-item>
    </el-timeline>
    <el-empty v-else :description="text.empty" :image-size="55" />
    <el-dialog v-model="visible" :title="editingId?text.edit:text.add" width="480px" destroy-on-close>
      <el-form label-width="100px"><el-form-item :label="text.type"><el-select v-model="form.milestone_type" style="width:100%"><el-option v-for="(label,key) in text.types" :key="key" :label="label" :value="key" /></el-select></el-form-item><el-form-item :label="text.name" required><el-input v-model="form.title" /></el-form-item><el-form-item :label="text.planned" required><el-date-picker v-model="form.planned_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item><el-form-item v-if="editingId&&form.planned_date!==originalDate" :label="text.reason" required><el-input v-model="form.reschedule_reason" type="textarea" :rows="2" /></el-form-item><el-form-item :label="text.notes"><el-input v-model="form.notes" type="textarea" :rows="3" /></el-form-item></el-form>
      <template #footer><el-button @click="visible=false">{{ text.cancel }}</el-button><el-button type="primary" :loading="saving" @click="save">{{ text.save }}</el-button></template>
    </el-dialog>
  </el-card>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '../store/index.js'
import { getOrderMilestones, createOrderMilestone, updateOrderMilestone, toggleOrderMilestone, deleteOrderMilestone } from '../api/orders.js'
import { validateMilestoneForm } from '../utils/milestone-form.js'
const props=defineProps({orderId:{type:[String,Number],required:true}});const {t}=useI18n();const {user}=useUserStore();const milestones=ref([]),visible=ref(false),saving=ref(false),editingId=ref(null),originalDate=ref('');const form=reactive({milestone_type:'production',title:'',planned_date:'',notes:'',reschedule_reason:''});const canDelete=computed(()=>['admin','manager'].includes(user.value?.role));const overdueCount=computed(()=>milestones.value.filter(x=>x.effective_status==='delayed').length)
const text = computed(() => ({
  title: t('orderMilestonePanel.title'),
  overdue: t('orderMilestonePanel.overdue'),
  add: t('orderMilestonePanel.add'),
  edit: t('common.edit'),
  type: t('orderMilestonePanel.type'),
  name: t('orderMilestonePanel.name'),
  planned: t('orderMilestonePanel.planned'),
  reason: t('orderMilestonePanel.reason'),
  original: t('orderMilestonePanel.original'),
  notes: t('orderMilestonePanel.notes'),
  complete: t('orderMilestonePanel.complete'),
  reopen: t('orderMilestonePanel.reopen'),
  delete: t('common.delete'),
  empty: t('orderMilestonePanel.empty'),
  cancel: t('common.cancel'),
  save: t('common.save'),
  nameRequired: t('orderMilestonePanel.nameRequired'),
  dateRequired: t('orderMilestonePanel.dateRequired'),
  reasonRequired: t('orderMilestonePanel.reasonRequired'),
  operationFailed: t('orderMilestonePanel.operationFailed'),
  types: {
    purchase: t('orderMilestone.purchase'),
    production: t('orderMilestone.production'),
    inspection: t('orderMilestone.inspection'),
    shipment: t('orderMilestone.shipment'),
    arrival: t('orderMilestone.arrival'),
    customs: t('orderMilestone.customs'),
    custom: t('orderMilestone.custom'),
  },
}))
function responseError(res){return res?.code===200?'':(res?.message||text.value.operationFailed)}
function requestError(error){return error?.message||text.value.operationFailed}
async function load(){try{const res=await getOrderMilestones(props.orderId);const error=responseError(res);if(error)return ElMessage.error(error);milestones.value=res.data||[]}catch(error){ElMessage.error(requestError(error))}}
function openDialog(){editingId.value=null;originalDate.value='';Object.assign(form,{milestone_type:'production',title:'',planned_date:'',notes:'',reschedule_reason:''});visible.value=true}
function edit(item){editingId.value=item.id;originalDate.value=String(item.planned_date).slice(0,10);Object.assign(form,{milestone_type:item.milestone_type,title:item.title,planned_date:originalDate.value,notes:item.notes||'',reschedule_reason:''});visible.value=true}
async function save(){const errors=validateMilestoneForm(form,{editing:Boolean(editingId.value),originalDate:originalDate.value,messages:{title:text.value.nameRequired,planned:text.value.dateRequired,reason:text.value.reasonRequired}});if(errors.length)return ElMessage.warning(errors[0]);saving.value=true;try{const res=editingId.value?await updateOrderMilestone(props.orderId,editingId.value,form):await createOrderMilestone(props.orderId,form);const error=responseError(res);if(error)return ElMessage.error(error);visible.value=false;await load()}catch(error){ElMessage.error(requestError(error))}finally{saving.value=false}}
async function toggle(item){try{const res=await toggleOrderMilestone(props.orderId,item.id,!item.completed_at);const error=responseError(res);if(error)return ElMessage.error(error);await load()}catch(error){ElMessage.error(requestError(error))}}
async function remove(item){try{await ElMessageBox.confirm(text.value.delete+'?')}catch{return}try{const res=await deleteOrderMilestone(props.orderId,item.id);const error=responseError(res);if(error)return ElMessage.error(error);await load()}catch(error){ElMessage.error(requestError(error))}}
onMounted(load)
</script>
<style scoped>.milestone-panel{margin-top:20px;border:1px solid #dbe5ef}.panel-header,.milestone{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.panel-header>div{display:flex;gap:12px}.panel-header span{color:#dc2626;font-size:12px}.milestone strong{margin-left:8px;color:#16324a}.milestone p{margin:7px 0 0;color:#64748b}.milestone.delayed{padding:10px;border-radius:8px;background:#fff7f7}.reschedule-note{display:block;margin-top:7px;color:#d46b08}</style>
