node {
    stage 'Checkout'
    checkout scm

    catchError {
      stage 'Tests'
      sh 'sh bin/test.sh'

      stage 'Build'
      sh 'docker build -t cestaky:master .'
    }
    step([$class: 'Mailer', notifyEveryUnstableBuild: true, recipients: 'dev@instea.co', sendToIndividuals: true])
}
