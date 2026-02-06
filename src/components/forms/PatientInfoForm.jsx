import Input from '../ui/Input';

function PatientInfoForm({
  patientInfo,
  onChange,
  accentColor = 'emerald',
  className = ''
}) {
  const handleChange = (field) => (e) => {
    onChange({ ...patientInfo, [field]: e.target.value });
  };

  return (
    <div className={`grid md:grid-cols-2 gap-4 ${className}`}>
      <Input
        label="환자 이름"
        type="text"
        value={patientInfo.name}
        onChange={handleChange('name')}
        placeholder="홍길동"
        accentColor={accentColor}
      />
      <Input
        label="환자 ID"
        type="text"
        value={patientInfo.id}
        onChange={handleChange('id')}
        placeholder="P-12345"
        accentColor={accentColor}
      />
    </div>
  );
}

export default PatientInfoForm;
